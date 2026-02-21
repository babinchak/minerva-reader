/**
 * Report on-demand credit usage to Stripe for metered billing.
 * Called when credits are deducted and balance goes negative (on-demand).
 */

import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || typeof key !== "string" || key.length < 10) return null;
  try {
    return new Stripe(key);
  } catch {
    return null;
  }
}

/**
 * Report on-demand usage (cents) to Stripe for metered billing.
 * Fire-and-forget; logs errors.
 * Only works for paid users with stripe_subscription_item_overage set.
 * Stripe price should be $0.01/unit so quantity=cents maps to dollars.
 */
export async function reportOverageUsageToStripe(
  userId: string,
  cents: number
): Promise<void> {
  if (cents <= 0) return;

  const stripe = getStripe();
  if (!stripe) return;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("user_credits")
    .select("stripe_subscription_item_overage")
    .eq("user_id", userId)
    .single();

  const subscriptionItemId = data?.stripe_subscription_item_overage as string | undefined;
  if (!subscriptionItemId) return;

  try {
    await stripe.rawRequest("POST", `/v1/subscription_items/${subscriptionItemId}/usage_records`, {
      quantity: cents,
      timestamp: Math.floor(Date.now() / 1000),
      action: "increment",
    });
  } catch (err) {
    console.error("[Stripe usage] Failed to report overage:", err);
  }
}
