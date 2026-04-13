/**
 * Usage system: tier resolution, balance checks (dollars-based).
 * Balances are stored directly on user_credits and decremented on each usage.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

export type UserTier = "anonymous" | "free" | "paid";

export type OnDemandLimitType = "disabled" | "fixed" | "unlimited";

/** Daily allowance for free tier in dollars. */
export const ALLOWANCE_DOLLARS_FREE_DAILY =
  Number(process.env.ALLOWANCE_DOLLARS_FREE_DAILY) || 0.50;

/** Monthly allowance for paid tier in dollars. */
export const ALLOWANCE_DOLLARS_PAID_MONTHLY =
  Number(process.env.ALLOWANCE_DOLLARS_PAID) || 10;

export interface UserCredits {
  tier: UserTier;
  allowanceDollars: number;
  includedBalance: number;
  extraUsageBalance: number;
  extraUsageSpent: number;
  allowanceResetAt: Date | null;
  onDemandLimitType: OnDemandLimitType;
  onDemandLimitDollars: number;
}

/** Model env vars per tier. Map to actual OpenAI model IDs. */
export const TIER_MODELS = {
  anonymous: process.env.OPENAI_MODEL_ANONYMOUS || "gpt-5.4-mini",
  free: process.env.OPENAI_MODEL_FREE || "gpt-5.4",
  paid: process.env.OPENAI_MODEL_PAID || "gpt-5.4",
} as const;

/** Get allowance in dollars for a tier. Free = daily, paid = monthly. */
export function allowanceDollarsForTier(tier: UserTier): number {
  return tier === "paid" ? ALLOWANCE_DOLLARS_PAID_MONTHLY : ALLOWANCE_DOLLARS_FREE_DAILY;
}

/** Get the next reset date for a tier. Free = tomorrow, paid = next month. */
function nextResetDate(tier: UserTier, from: Date = new Date()): Date {
  const next = new Date(from);
  if (tier === "paid") {
    const day = next.getDate();
    next.setMonth(next.getMonth() + 1);
    // If the day overflowed (e.g. Jan 31 → Mar 3), clamp to last day of target month
    if (next.getDate() !== day) {
      next.setDate(0); // sets to last day of the previous month
    }
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
  }
  return next;
}

/** Estimated cost in dollars per agentic request. */
export const AGENTIC_ESTIMATED_DOLLARS =
  Number(process.env.AGENTIC_ESTIMATED_DOLLARS) || 1.0;

/** True when FREE_BETA_MODE env var is set (e.g. "1" or "true"). */
export function isFreeBetaMode(): boolean {
  const v = process.env.FREE_BETA_MODE;
  return !!(v && (v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes"));
}

/**
 * Resolve tier from user. Anonymous if no user.
 * In free beta mode, authenticated users and anonymous are treated as paid (premium model, Deep mode).
 */
export async function getTier(userId: string | null): Promise<UserTier> {
  if (isFreeBetaMode()) return "paid";
  if (!userId) return "anonymous";

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("user_credits")
    .select("tier")
    .eq("user_id", userId)
    .single();

  if (!data) return "free"; // Default for new users
  return (data.tier as UserTier) || "free";
}

/**
 * Get model string for tier.
 */
export function getModelForTier(tier: UserTier): string {
  return TIER_MODELS[tier];
}

/**
 * Get user credits. Creates row and applies allowance reset if needed.
 */
export async function getCredits(userId: string): Promise<UserCredits | null> {
  const supabase = createServiceClient();
  await ensureUserCredits(userId);

  const { data, error } = await supabase
    .from("user_credits")
    .select("tier, allowance_dollars, included_balance, extra_usage_balance, extra_usage_spent, allowance_reset_at, on_demand_limit_type, on_demand_limit_dollars")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  const tier = (data.tier as UserTier) || "free";

  return {
    tier,
    allowanceDollars: data.allowance_dollars ?? allowanceDollarsForTier(tier),
    includedBalance: data.included_balance ?? 0,
    extraUsageBalance: data.extra_usage_balance ?? 0,
    extraUsageSpent: data.extra_usage_spent ?? 0,
    allowanceResetAt: data.allowance_reset_at ? new Date(data.allowance_reset_at) : null,
    onDemandLimitType: (data.on_demand_limit_type as OnDemandLimitType) || "disabled",
    onDemandLimitDollars: data.on_demand_limit_dollars ?? 10,
  };
}

/**
 * Ensure user has a user_credits row. Apply allowance reset if due.
 * Free tier resets daily, paid tier resets monthly.
 */
export async function ensureUserCredits(userId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: existing, error: selectError } = await supabase
    .from("user_credits")
    .select("user_id, tier, allowance_reset_at")
    .eq("user_id", userId)
    .single();

  if (selectError && selectError.code !== "PGRST116") {
    console.error("[credits] ensureUserCredits select error:", selectError);
  }

  const now = new Date();
  const tier = (existing?.tier as UserTier) || "free";
  const allowanceDollars = allowanceDollarsForTier(tier);

  if (!existing) {
    const resetAt = nextResetDate("free", now);

    const { error: insertError } = await supabase.from("user_credits").insert({
      user_id: userId,
      tier: "free",
      allowance_dollars: allowanceDollars,
      included_balance: allowanceDollars,
      extra_usage_balance: 0,
      allowance_reset_at: resetAt.toISOString(),
      updated_at: now.toISOString(),
    });

    if (insertError) {
      if (insertError.code === "23505" || insertError.message?.includes("duplicate")) return;
      throw insertError;
    }
    return;
  }

  const resetAt = existing.allowance_reset_at
    ? new Date(existing.allowance_reset_at)
    : null;

  // Only lazy-reset free tier. Paid tier resets are handled by Stripe
  // invoice.paid webhook to ensure payment actually succeeded.
  if (tier === "free" && resetAt && now >= resetAt) {
    const allowanceDollarsNow = allowanceDollarsForTier(tier);

    // Step forward from the original reset date to maintain a fixed cadence
    let nextReset = new Date(resetAt);
    while (nextReset <= now) {
      nextReset = nextResetDate(tier, nextReset);
    }

    await supabase
      .from("user_credits")
      .update({
        allowance_dollars: allowanceDollarsNow,
        included_balance: allowanceDollarsNow,
        extra_usage_spent: 0,
        allowance_reset_at: nextReset.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("user_id", userId);
  }
}

export type UsageDeniedReason =
  | "included_exhausted_extra_disabled"
  | "included_exhausted_extra_empty"
  | "included_exhausted_extra_limit_reached"
  | "no_credits";

export interface UsageCheckResult {
  allowed: boolean;
  reason?: UsageDeniedReason;
  resetAt?: string | null;
  tier?: UserTier;
  extraUsageBalance?: number;
  onDemandLimitType?: OnDemandLimitType;
  onDemandLimitDollars?: number;
  extraUsageSpent?: number;
}

/**
 * Check if user can make a request costing estimatedCostDollars.
 * Returns structured result with denial reason when blocked.
 */
export async function canMakeRequest(
  userId: string,
  estimatedCostDollars: number,
  userEmail?: string | null
): Promise<UsageCheckResult> {
  if (isFreeBetaMode()) return { allowed: true };
  if (isAdminEmail(userEmail)) return { allowed: true };
  const credits = await getCredits(userId);
  if (!credits) return { allowed: false, reason: "no_credits" };

  const base = {
    resetAt: credits.allowanceResetAt?.toISOString() ?? null,
    tier: credits.tier,
    extraUsageBalance: credits.extraUsageBalance,
    onDemandLimitType: credits.onDemandLimitType,
    onDemandLimitDollars: credits.onDemandLimitDollars,
    extraUsageSpent: credits.extraUsageSpent,
  };

  if (credits.includedBalance > 0) return { allowed: true, ...base };

  // No included balance left — check extra usage
  if (credits.onDemandLimitType === "disabled") {
    return { allowed: false, reason: "included_exhausted_extra_disabled", ...base };
  }
  if (credits.extraUsageBalance <= 0) {
    return { allowed: false, reason: "included_exhausted_extra_empty", ...base };
  }

  // Check monthly limit
  if (credits.onDemandLimitType === "fixed" && credits.extraUsageSpent >= credits.onDemandLimitDollars) {
    return { allowed: false, reason: "included_exhausted_extra_limit_reached", ...base };
  }

  return { allowed: true, ...base };
}

/**
 * Update on-demand limit for a user. Paid tier only.
 */
export async function updateOnDemandLimit(
  userId: string,
  limitType: OnDemandLimitType,
  limitDollars?: number
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("user_credits")
    .select("tier")
    .eq("user_id", userId)
    .single();

  if (!data || (data.tier as UserTier) !== "paid") return false;

  const update: Record<string, unknown> = {
    on_demand_limit_type: limitType,
    updated_at: new Date().toISOString(),
  };
  if (limitType === "fixed" && typeof limitDollars === "number" && limitDollars >= 0) {
    update.on_demand_limit_dollars = limitDollars;
  }

  const { error } = await supabase
    .from("user_credits")
    .update(update)
    .eq("user_id", userId);

  return !error;
}


/**
 * Count books currently being processed (started but not completed/failed) for a user.
 */
export async function countInFlightProcessing(userId: string): Promise<number> {
  const supabase = createServiceClient();

  const hourAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: userBooks } = await supabase
    .from("books")
    .select("id")
    .eq("uploaded_by", userId)
    .gte("created_at", hourAgo);

  const bookIds = (userBooks ?? []).map((b) => b.id);
  if (bookIds.length === 0) return 0;

  const { data: events } = await supabase
    .from("processing_events")
    .select("book_id, status, created_at")
    .in("book_id", bookIds);

  const byBook = new Map<string, { status: string; created_at: string }>();
  for (const e of events ?? []) {
    const existing = byBook.get(e.book_id);
    if (!existing || e.created_at > existing.created_at) {
      byBook.set(e.book_id, { status: e.status, created_at: e.created_at });
    }
  }
  let inFlight = 0;
  for (const [, latest] of byBook) {
    if (latest.status === "started") inFlight++;
  }
  return inFlight;
}

/** Max concurrent books being processed per free-tier user. */
export const MAX_CONCURRENT_PROCESSING_FREE = Number(process.env.MAX_CONCURRENT_PROCESSING_FREE) || 3;

/** Max concurrent books being processed per paid-tier user. */
export const MAX_CONCURRENT_PROCESSING_PAID = Number(process.env.MAX_CONCURRENT_PROCESSING_PAID) || 5;

/** Get the concurrent processing limit for a tier. */
export function maxConcurrentProcessing(tier: UserTier): number {
  return tier === "paid" ? MAX_CONCURRENT_PROCESSING_PAID : MAX_CONCURRENT_PROCESSING_FREE;
}
