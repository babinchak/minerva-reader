import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import type { CheckoutSessionParams, CheckoutSessionResult } from "./provider";
import { ALLOWANCE_DOLLARS_PAID_MONTHLY, ALLOWANCE_DOLLARS_FREE_DAILY } from "@/lib/credits";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || typeof key !== "string" || key.length < 10) return null;
  try {
    return new Stripe(key);
  } catch {
    return null;
  }
}

const PRICE_ID_PRO = process.env.STRIPE_PRICE_ID_PRO;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/** Safely convert Unix timestamp to ISO string. Returns null if invalid. */
function unixToIso(unix: unknown): string | null {
  const n = typeof unix === "number" ? unix : Number(unix);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Extract current_period_end from a Stripe subscription.
 * In Stripe SDK v20+ (API 2026+), this moved from the subscription
 * top level to subscription.items.data[0].current_period_end.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSubscriptionPeriodEnd(sub: any): number | null {
  // Try top-level first (older API versions)
  if (typeof sub.current_period_end === "number") return sub.current_period_end;
  // New location: items.data[0].current_period_end
  const item = sub.items?.data?.[0];
  if (item && typeof item.current_period_end === "number") return item.current_period_end;
  return null;
}

export async function createStripeCheckoutSession(
  params: CheckoutSessionParams
): Promise<CheckoutSessionResult | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  const supabase = createServiceClient();
  let { data: credits } = await supabase
    .from("user_credits")
    .select("stripe_customer_id")
    .eq("user_id", params.userId)
    .single();

  let customerId = credits?.stripe_customer_id as string | undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: params.userEmail || undefined,
      metadata: { user_id: params.userId },
    });
    customerId = customer.id;
    const { data: existing } = await supabase
      .from("user_credits")
      .select("user_id")
      .eq("user_id", params.userId)
      .single();

    if (existing) {
      await supabase
        .from("user_credits")
        .update({
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", params.userId);
    } else {
      await supabase.from("user_credits").insert({
        user_id: params.userId,
        tier: "free",
        stripe_customer_id: customerId,
      });
    }
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { user_id: params.userId },
  };

  if (params.mode === "subscription" && PRICE_ID_PRO) {
    sessionParams.mode = "subscription";
    sessionParams.line_items = [{ price: PRICE_ID_PRO, quantity: 1 }];
    sessionParams.subscription_data = {
      metadata: { user_id: params.userId },
    };
  } else if (params.mode === "top_up" && params.topUpDollars && params.topUpDollars > 0) {
    sessionParams.mode = "payment";
    sessionParams.metadata!.top_up_dollars = String(params.topUpDollars);
    sessionParams.line_items = [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "Extra usage balance" },
          unit_amount: Math.round(params.topUpDollars * 100), // cents
        },
        quantity: 1,
      },
    ];
  } else {
    return null;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  if (!session.url) return null;

  return { url: session.url, sessionId: session.id };
}

export async function handleStripeWebhook(
  payload: string | Buffer,
  signature: string
): Promise<{ handled: boolean; error?: string }> {
  if (!WEBHOOK_SECRET) {
    return { handled: false, error: "STRIPE_WEBHOOK_SECRET not configured" };
  }

  const stripe = getStripe();
  if (!stripe) return { handled: false, error: "Stripe not configured" };
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    console.warn("[Stripe webhook] Signature verification failed:", msg, "- Use the webhook secret from 'stripe listen' for local testing");
    return { handled: false, error: msg };
  }

  const supabase = createServiceClient();

  const log = (msg: string, data?: object) =>
    console.log(`[Stripe webhook] ${event.type} (${event.id}): ${msg}`, data ?? "");

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      log("session", { mode: session.mode, subscription: session.subscription, userId });
      if (!userId) {
        console.warn("[Stripe webhook] checkout.session.completed: no user_id in metadata", session.id);
        break;
      }

      if (session.mode === "subscription" && session.subscription) {
        // Subscription checkout — upgrade to paid
        const sub = await stripe.subscriptions.retrieve(
          session.subscription as string
        );
        log("retrieved subscription", { subId: sub.id, status: sub.status });

        const resetAt = unixToIso(getSubscriptionPeriodEnd(sub)) ?? (() => {
          const d = new Date();
          d.setMonth(d.getMonth() + 1);
          return d.toISOString();
        })();

        const { error: upsertError } = await supabase
          .from("user_credits")
          .upsert(
            {
              user_id: userId,
              tier: "paid",
              allowance_dollars: ALLOWANCE_DOLLARS_PAID_MONTHLY,
              included_balance: ALLOWANCE_DOLLARS_PAID_MONTHLY,
              extra_usage_spent: 0,
              stripe_subscription_id: sub.id,
              allowance_reset_at: resetAt,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );

        if (upsertError) {
          console.error("[Stripe webhook] Failed to upgrade user to paid:", upsertError);
        } else {
          log("→ UPGRADED to paid", { userId });
        }
      } else if (session.mode === "payment") {
        // One-time payment — top up extra usage balance
        const topUpDollars = parseFloat(session.metadata?.top_up_dollars ?? "0");
        if (topUpDollars > 0) {
          const { data: current } = await supabase
            .from("user_credits")
            .select("extra_usage_balance")
            .eq("user_id", userId)
            .single();

          const currentBalance = current?.extra_usage_balance ?? 0;

          await supabase
            .from("user_credits")
            .update({
              extra_usage_balance: currentBalance + topUpDollars,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);

          log("→ TOPPED UP extra usage", { userId, topUpDollars, newBalance: currentBalance + topUpDollars });
        }
      }
      break;
    }

    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      log("subscription created", { subId: sub.id, status: sub.status, hasUserId: !!userId });
      if (!userId || !["active", "trialing"].includes(sub.status)) break;

      const resetAt = unixToIso(getSubscriptionPeriodEnd(sub)) ?? (() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        return d.toISOString();
      })();

      await supabase
        .from("user_credits")
        .upsert(
          {
            user_id: userId,
            tier: "paid",
            allowance_dollars: ALLOWANCE_DOLLARS_PAID_MONTHLY,
            included_balance: ALLOWANCE_DOLLARS_PAID_MONTHLY,
            stripe_subscription_id: sub.id,
            allowance_reset_at: resetAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      log("→ UPGRADED to paid (subscription.created)", { userId });
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      const periodEnd = getSubscriptionPeriodEnd(sub);
      log("subscription event", {
        subId: sub.id,
        status: sub.status,
        hasUserId: !!userId,
        periodEnd,
      });
      if (!userId) {
        log("→ SKIP: no user_id in subscription metadata");
        break;
      }

      const failedStatuses = ["canceled", "unpaid", "incomplete_expired", "past_due"];
      const shouldDowngrade =
        event.type === "customer.subscription.deleted" ||
        failedStatuses.includes(sub.status);

      if (shouldDowngrade) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        await supabase
          .from("user_credits")
          .update({
            tier: "free",
            allowance_dollars: ALLOWANCE_DOLLARS_FREE_DAILY,
            included_balance: ALLOWANCE_DOLLARS_FREE_DAILY,
            stripe_subscription_id: null,
            allowance_reset_at: tomorrow.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);
        log("→ DOWNGRADED to free", { subId: sub.id, reason: event.type === "customer.subscription.deleted" ? "deleted" : `status=${sub.status}` });
      } else if (["active", "trialing"].includes(sub.status)) {
        const resetAt = unixToIso(periodEnd);

        // Check if the billing period advanced — if so, reset included balance
        const { data: current } = await supabase
          .from("user_credits")
          .select("allowance_reset_at")
          .eq("stripe_subscription_id", sub.id)
          .single();

        const storedResetAt = current?.allowance_reset_at ?? null;
        const periodAdvanced = resetAt && resetAt !== storedResetAt;

        const update: Record<string, unknown> = {
          allowance_dollars: ALLOWANCE_DOLLARS_PAID_MONTHLY,
          updated_at: new Date().toISOString(),
        };
        if (resetAt) {
          update.allowance_reset_at = resetAt;
        }
        if (periodAdvanced) {
          update.included_balance = ALLOWANCE_DOLLARS_PAID_MONTHLY;
          update.extra_usage_spent = 0;
        }
        await supabase
          .from("user_credits")
          .update(update)
          .eq("stripe_subscription_id", sub.id);
        log(periodAdvanced
          ? "→ RENEWED included balance (period advanced)"
          : "→ updated allowance (kept paid)",
          { subId: sub.id, status: sub.status, periodAdvanced, resetAt, storedResetAt });
      } else {
        log("→ SKIP: status not active/trialing/failed", { status: sub.status });
      }
      break;
    }

    case "invoice.paid": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoice = event.data.object as any;
      // Newer Stripe API versions moved subscription to parent.subscription_details
      const subscriptionId: string | null =
        (typeof invoice.subscription === "string" ? invoice.subscription : null)
        ?? invoice.parent?.subscription_details?.subscription
        ?? invoice.lines?.data?.[0]?.subscription
        ?? null;
      const billingReason: string | null =
        invoice.billing_reason
        ?? invoice.parent?.subscription_details?.billing_reason
        ?? null;
      log("invoice", { billingReason, subscriptionId: subscriptionId ?? "(none)" });
      if (billingReason === "subscription_cycle" && subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const periodEnd = getSubscriptionPeriodEnd(sub);
        let userId = sub.metadata?.user_id ?? null;
        const resetAt = unixToIso(periodEnd);
        log("invoice.paid sub details", { userId, resetAt, periodEnd });

        // Fallback: look up user by stripe_subscription_id if metadata missing
        if (!userId) {
          const { data: match } = await supabase
            .from("user_credits")
            .select("user_id")
            .eq("stripe_subscription_id", subscriptionId)
            .single();
          userId = match?.user_id ?? null;
          if (userId) log("→ resolved userId from DB fallback", { userId });
        }

        if (userId && resetAt) {
          await supabase
            .from("user_credits")
            .update({
              allowance_dollars: ALLOWANCE_DOLLARS_PAID_MONTHLY,
              included_balance: ALLOWANCE_DOLLARS_PAID_MONTHLY,
              extra_usage_spent: 0,
              allowance_reset_at: resetAt,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
          log("→ RENEWED included balance", { userId });
        } else {
          log("→ SKIP renewal: missing data", { userId, resetAt });
        }
      }
      break;
    }

    default:
      log("(unhandled event type)");
      break;
  }

  return { handled: true };
}

/**
 * Get subscription status for a user.
 */
export async function getSubscriptionStatus(
  userId: string
): Promise<{ active: boolean; cancelAtPeriodEnd: boolean; cancelAt: string | null } | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("user_credits")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .single();

  const subId = data?.stripe_subscription_id;
  if (!subId) return null;

  try {
    const sub = await stripe.subscriptions.retrieve(subId);
    return {
      active: ["active", "trialing"].includes(sub.status),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() :
                sub.cancel_at_period_end && getSubscriptionPeriodEnd(sub)
                  ? new Date(getSubscriptionPeriodEnd(sub)! * 1000).toISOString()
                  : null,
    };
  } catch {
    return null;
  }
}

/**
 * Cancel a subscription at period end (user keeps access until current period expires).
 */
export async function cancelSubscriptionAtPeriodEnd(
  userId: string
): Promise<{ success: boolean; error?: string; cancelAt?: string }> {
  const stripe = getStripe();
  if (!stripe) return { success: false, error: "Stripe not configured" };

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("user_credits")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .single();

  const subId = data?.stripe_subscription_id;
  if (!subId) return { success: false, error: "No active subscription found" };

  const sub = await stripe.subscriptions.update(subId, {
    cancel_at_period_end: true,
  });

  return {
    success: true,
    cancelAt: getSubscriptionPeriodEnd(sub)
      ? new Date(getSubscriptionPeriodEnd(sub)! * 1000).toISOString()
      : undefined,
  };
}

/**
 * Resume a subscription that was set to cancel at period end.
 */
export async function resumeSubscription(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const stripe = getStripe();
  if (!stripe) return { success: false, error: "Stripe not configured" };

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("user_credits")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .single();

  const subId = data?.stripe_subscription_id;
  if (!subId) return { success: false, error: "No active subscription found" };

  await stripe.subscriptions.update(subId, {
    cancel_at_period_end: false,
  });

  return { success: true };
}
