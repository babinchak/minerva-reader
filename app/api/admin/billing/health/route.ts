import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || typeof key !== "string" || key.length < 10) return null;
  try {
    return new Stripe(key);
  } catch {
    return null;
  }
}

type AnomalyType =
  | "balance_exceeds_allowance"
  | "negative_balance"
  | "paid_no_stripe_sub"
  | "stripe_active_but_free"
  | "orphan_stripe_sub";

type Anomaly = {
  type: AnomalyType;
  message: string;
};

type UserBillingHealth = {
  userId: string;
  email: string | null;
  tier: string;
  includedBalance: number;
  extraUsageBalance: number;
  extraUsageSpent: number;
  allowanceDollars: number;
  allowanceResetAt: string | null;
  onDemandLimitType: string;
  onDemandLimitDollars: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeStatus: string | null;
  stripePeriodEnd: string | null;
  anomalies: Anomaly[];
};

type OrphanSubscription = {
  subscriptionId: string;
  customerId: string;
  status: string;
  currentPeriodEnd: string | null;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch all user_credits
    const { data: credits, error: creditsError } = await serviceSupabase
      .from("user_credits")
      .select("user_id, tier, included_balance, extra_usage_balance, extra_usage_spent, allowance_dollars, allowance_reset_at, on_demand_limit_type, on_demand_limit_dollars, stripe_customer_id, stripe_subscription_id");

    if (creditsError) throw creditsError;

    // Fetch auth users for email mapping
    const { data: { users: authUsers } } = await serviceSupabase.auth.admin.listUsers({ perPage: 1000 });
    const emailMap = new Map((authUsers ?? []).map((u) => [u.id, u.email ?? null]));

    // Fetch all Stripe subscriptions
    const stripe = getStripe();
    const stripeSubMap = new Map<string, { status: string; currentPeriodEnd: string | null; customerId: string }>();
    const allStripeSubs: { id: string; customerId: string; status: string; currentPeriodEnd: string | null }[] = [];

    if (stripe) {
      try {
        let hasMore = true;
        let startingAfter: string | undefined;
        while (hasMore) {
          const params: Stripe.SubscriptionListParams = { limit: 100, status: "all" };
          if (startingAfter) params.starting_after = startingAfter;
          const list = await stripe.subscriptions.list(params);
          for (const sub of list.data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rawPeriodEnd = (sub as any).current_period_end as number | null;
            const periodEnd = rawPeriodEnd
              ? new Date(rawPeriodEnd * 1000).toISOString()
              : null;
            allStripeSubs.push({
              id: sub.id,
              customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
              status: sub.status,
              currentPeriodEnd: periodEnd,
            });
            // Index by subscription ID for quick lookup
            stripeSubMap.set(sub.id, {
              status: sub.status,
              currentPeriodEnd: periodEnd,
              customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
            });
          }
          hasMore = list.has_more;
          if (list.data.length > 0) startingAfter = list.data[list.data.length - 1].id;
        }
      } catch (err) {
        console.error("[ADMIN] Stripe list subscriptions error:", err);
      }
    }

    // Track which Stripe sub IDs are referenced by user_credits
    const referencedSubIds = new Set<string>();

    const now = new Date();
    const users: UserBillingHealth[] = (credits ?? []).map((c) => {
      const anomalies: Anomaly[] = [];
      const includedBalance = Number(c.included_balance) || 0;
      const extraUsageBalance = Number(c.extra_usage_balance) || 0;
      const allowanceDollars = Number(c.allowance_dollars) || 0;

      // Check: included_balance > allowance_dollars
      if (includedBalance > allowanceDollars + 0.001) {
        anomalies.push({
          type: "balance_exceeds_allowance",
          message: `Included balance ($${includedBalance.toFixed(2)}) exceeds allowance ($${allowanceDollars.toFixed(2)})`,
        });
      }

      // Check: negative balances
      if (includedBalance < -0.001) {
        anomalies.push({
          type: "negative_balance",
          message: `Negative included balance: $${includedBalance.toFixed(2)}`,
        });
      }
      if (extraUsageBalance < -0.001) {
        anomalies.push({
          type: "negative_balance",
          message: `Negative extra usage balance: $${extraUsageBalance.toFixed(2)}`,
        });
      }

      // Note: allowance_reset_at in the past is expected — resets are lazy
      // (applied on next user interaction), not a real anomaly.

      // Stripe cross-reference
      let stripeStatus: string | null = null;
      let stripePeriodEnd: string | null = null;

      if (c.stripe_subscription_id) {
        referencedSubIds.add(c.stripe_subscription_id);
        const sub = stripeSubMap.get(c.stripe_subscription_id);
        if (sub) {
          stripeStatus = sub.status;
          stripePeriodEnd = sub.currentPeriodEnd;
        }
      }

      // Check: tier=paid but no Stripe subscription or subscription not active
      if (c.tier === "paid") {
        if (!c.stripe_subscription_id) {
          anomalies.push({
            type: "paid_no_stripe_sub",
            message: "Tier is paid but no Stripe subscription ID stored",
          });
        } else if (stripeStatus && stripeStatus !== "active" && stripeStatus !== "trialing") {
          anomalies.push({
            type: "paid_no_stripe_sub",
            message: `Tier is paid but Stripe subscription status is "${stripeStatus}"`,
          });
        }
      }

      // Check: Stripe subscription active but tier is free
      if (c.tier === "free" && c.stripe_subscription_id && stripeStatus === "active") {
        anomalies.push({
          type: "stripe_active_but_free",
          message: "Active Stripe subscription but tier is free",
        });
      }

      return {
        userId: c.user_id,
        email: emailMap.get(c.user_id) ?? null,
        tier: c.tier ?? "free",
        includedBalance,
        extraUsageBalance,
        extraUsageSpent: Number(c.extra_usage_spent) || 0,
        allowanceDollars,
        allowanceResetAt: c.allowance_reset_at,
        onDemandLimitType: c.on_demand_limit_type ?? "disabled",
        onDemandLimitDollars: Number(c.on_demand_limit_dollars) || 0,
        stripeCustomerId: c.stripe_customer_id,
        stripeSubscriptionId: c.stripe_subscription_id,
        stripeStatus,
        stripePeriodEnd,
        anomalies,
      };
    });

    // Find orphan Stripe subscriptions (active subs not referenced by any user)
    const orphanSubscriptions: OrphanSubscription[] = allStripeSubs
      .filter((s) => (s.status === "active" || s.status === "trialing") && !referencedSubIds.has(s.id))
      .map((s) => ({
        subscriptionId: s.id,
        customerId: s.customerId,
        status: s.status,
        currentPeriodEnd: s.currentPeriodEnd,
      }));

    // Sort: anomalies first, then paid, then by email
    users.sort((a, b) => {
      if (a.anomalies.length !== b.anomalies.length) return b.anomalies.length - a.anomalies.length;
      if (a.tier !== b.tier) return a.tier === "paid" ? -1 : 1;
      return (a.email ?? "").localeCompare(b.email ?? "");
    });

    return NextResponse.json({
      users,
      orphanSubscriptions,
      totalAnomalies: users.reduce((sum, u) => sum + u.anomalies.length, 0) + orphanSubscriptions.length,
    });
  } catch (err) {
    console.error("[ADMIN] Billing health error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
