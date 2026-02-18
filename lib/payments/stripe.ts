import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { addCredits } from "@/lib/credits";
import type { CheckoutSessionParams, CheckoutSessionResult } from "./provider";

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
const PRICE_ID_TOPUP_25K = process.env.STRIPE_PRICE_ID_TOPUP_25K ?? process.env.STRIPE_PRICE_ID_TOPUP;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/** Safely convert Unix timestamp to ISO string. Returns null if invalid. */
function unixToIso(unix: unknown): string | null {
  const n = typeof unix === "number" ? unix : Number(unix);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  return isNaN(d.getTime()) ? null : d.toISOString();
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
        balance: 0,
        tier: "free",
        monthly_allowance: 5000,
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
  } else if (params.mode === "payment" && params.credits && PRICE_ID_TOPUP_25K) {
    sessionParams.mode = "payment";
    sessionParams.line_items = [
      { price: PRICE_ID_TOPUP_25K, quantity: Math.ceil(params.credits / 25_000) },
    ];
    sessionParams.metadata = {
      ...sessionParams.metadata,
      credits: String(params.credits),
      type: "topup",
    };
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
        const sub = (await stripe.subscriptions.retrieve(
          session.subscription as string
        )) as unknown as { id: string; status?: string; current_period_end: number; items: { data: { price: { id: string } }[] } };
        log("retrieved subscription", { subId: sub.id, status: sub.status });
        const priceId = sub.items.data[0]?.price.id;
        const allowance = priceId === PRICE_ID_PRO ? 50_000 : 0;

        const resetAt = unixToIso(sub.current_period_end) ?? (() => {
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
              monthly_allowance: allowance,
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
      } else if (session.metadata?.type === "topup") {
        const credits = parseInt(session.metadata.credits ?? "25000", 10);
        if (credits > 0) {
          await addCredits(userId, credits, "topup", {
            payment_provider: "stripe",
            session_id: session.id,
          });
        }
      }
      break;
    }

    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription & { current_period_end?: number };
      const userId = sub.metadata?.user_id;
      log("subscription created", { subId: sub.id, status: sub.status, hasUserId: !!userId });
      if (!userId || !["active", "trialing"].includes(sub.status)) break;

      const allowance = sub.items.data[0]?.price.id === PRICE_ID_PRO ? 50_000 : 0;
      const resetAt = unixToIso(sub.current_period_end) ?? (() => {
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
            monthly_allowance: allowance,
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
      const sub = event.data.object as Stripe.Subscription & { current_period_end?: number };
      const userId = sub.metadata?.user_id;
      log("subscription event", {
        subId: sub.id,
        status: sub.status,
        hasUserId: !!userId,
      });
      if (!userId) {
        log("→ SKIP: no user_id in subscription metadata");
        break;
      }

      // Only downgrade when subscription is definitively cancelled/failed.
      // Do NOT downgrade for "incomplete" - payment may still be processing.
      const failedStatuses = ["canceled", "unpaid", "incomplete_expired", "past_due"];
      const shouldDowngrade =
        event.type === "customer.subscription.deleted" ||
        failedStatuses.includes(sub.status);

      if (shouldDowngrade) {
        await supabase
          .from("user_credits")
          .update({
            tier: "free",
            monthly_allowance: 5_000,
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);
        log("→ DOWNGRADED to free", { subId: sub.id, reason: event.type === "customer.subscription.deleted" ? "deleted" : `status=${sub.status}` });
      } else if (["active", "trialing"].includes(sub.status)) {
        const allowance = sub.items.data[0]?.price.id === PRICE_ID_PRO ? 50_000 : 0;
        const resetAt = unixToIso(sub.current_period_end);
        await supabase
          .from("user_credits")
          .update({
            monthly_allowance: allowance,
            allowance_reset_at: resetAt,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);
        log("→ updated allowance (kept paid)", { subId: sub.id, status: sub.status });
      } else {
        log("→ SKIP: status not active/trialing/failed", { status: sub.status });
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string; billing_reason?: string };
      log("invoice", { billing_reason: invoice.billing_reason, hasSubscription: !!invoice.subscription });
      if (invoice.billing_reason === "subscription_cycle" && invoice.subscription) {
        const sub = (await stripe.subscriptions.retrieve(
          invoice.subscription
        )) as unknown as { current_period_end: number; metadata?: { user_id?: string } };
        const userId = sub.metadata?.user_id;
        const resetAt = unixToIso(sub.current_period_end);
        if (userId && resetAt) {
          const allowance = 50_000;
          const { data: row } = await supabase
            .from("user_credits")
            .select("balance")
            .eq("user_id", userId)
            .single();
          const currentBalance = row?.balance ?? 0;
          await supabase
            .from("user_credits")
            .update({
              balance: currentBalance + allowance,
              allowance_reset_at: resetAt,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
          await supabase.from("credit_transactions").insert({
            user_id: userId,
            amount: allowance,
            type: "allowance",
            metadata: { reason: "subscription_renewal", invoice_id: invoice.id },
          });
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
