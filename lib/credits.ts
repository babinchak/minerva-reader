/**
 * Usage system: tier resolution, balance checks (dollars-based).
 * Balance is derived: allowance_dollars - SUM(usage_records.cost_dollars since reset).
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
  Number(process.env.ALLOWANCE_DOLLARS_PAID) || 20;

export interface UserCredits {
  tier: UserTier;
  allowanceDollars: number;
  allowanceResetAt: Date | null;
  spentDollars: number;
  remainingDollars: number;
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
    next.setMonth(next.getMonth() + 1);
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
 * Get total spend in dollars for a user since a given date.
 */
async function getSpendSince(userId: string, since: Date): Promise<number> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("usage_records")
    .select("cost_dollars")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString());

  if (!data || data.length === 0) return 0;
  return data.reduce((sum, r) => sum + (r.cost_dollars ?? 0), 0);
}

/**
 * Get user credits with derived balance. Creates row and applies allowance reset if needed.
 */
export async function getCredits(userId: string): Promise<UserCredits | null> {
  const supabase = createServiceClient();
  await ensureUserCredits(userId);

  const { data, error } = await supabase
    .from("user_credits")
    .select("tier, allowance_dollars, allowance_reset_at, on_demand_limit_type, on_demand_limit_dollars")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  const tier = (data.tier as UserTier) || "free";
  const allowanceDollars = data.allowance_dollars ?? allowanceDollarsForTier(tier);
  const resetAt = data.allowance_reset_at ? new Date(data.allowance_reset_at) : null;

  // Derive balance from usage_records since last reset
  const periodStart = getPeriodStart(tier, resetAt);
  const spentDollars = await getSpendSince(userId, periodStart);
  const remainingDollars = allowanceDollars - spentDollars;

  return {
    tier,
    allowanceDollars,
    allowanceResetAt: resetAt,
    spentDollars,
    remainingDollars,
    onDemandLimitType: (data.on_demand_limit_type as OnDemandLimitType) || "disabled",
    onDemandLimitDollars: data.on_demand_limit_dollars ?? 10,
  };
}

/**
 * Get the start of the current billing period.
 * For free tier: reset - 1 day. For paid tier: reset - 1 month.
 */
export function getPeriodStart(tier: UserTier, resetAt: Date | null): Date {
  if (!resetAt) return new Date(0); // no reset date = count everything
  const start = new Date(resetAt);
  if (tier === "paid") {
    start.setMonth(start.getMonth() - 1);
  } else {
    start.setDate(start.getDate() - 1);
  }
  return start;
}

/**
 * Ensure user has a user_credits row. Apply allowance reset if due.
 * Free tier resets daily, paid tier resets monthly.
 */
export async function ensureUserCredits(userId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("user_credits")
    .select("id, tier, allowance_reset_at")
    .eq("user_id", userId)
    .single();

  const now = new Date();
  const tier = (existing?.tier as UserTier) || "free";
  const allowanceDollars = allowanceDollarsForTier(tier);

  if (!existing) {
    const resetAt = nextResetDate("free", now);

    const { error: insertError } = await supabase.from("user_credits").insert({
      user_id: userId,
      tier: "free",
      allowance_dollars: allowanceDollars,
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

  if (resetAt && now >= resetAt) {
    const allowanceDollarsNow = allowanceDollarsForTier(tier);

    await supabase
      .from("user_credits")
      .update({
        allowance_dollars: allowanceDollarsNow,
        allowance_reset_at: nextResetDate(tier, now).toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("user_id", userId);
  }
}

/**
 * Check if user can make a request costing estimatedCostDollars.
 * - Free beta mode: always allow.
 * - Has remaining allowance: allow.
 * - On-demand enabled: check limit.
 */
export async function canMakeRequest(
  userId: string,
  estimatedCostDollars: number,
  userEmail?: string | null
): Promise<boolean> {
  if (isFreeBetaMode()) return true;
  if (isAdminEmail(userEmail)) return true;
  const credits = await getCredits(userId);
  if (!credits) return false;
  if (credits.remainingDollars > 0) return true;

  // On-demand check
  if (credits.onDemandLimitType === "disabled") return false;
  if (credits.onDemandLimitType === "unlimited") return true;

  // Fixed limit: overage so far + this request's overage
  const overageSoFar = Math.max(0, -credits.remainingDollars);
  const wouldBeOverage = overageSoFar + estimatedCostDollars;
  return wouldBeOverage <= credits.onDemandLimitDollars;
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
 * Count books uploaded by user in the last 7 days.
 */
export async function countBooksUploadedThisWeek(userId: string): Promise<number> {
  const supabase = createServiceClient();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { count, error } = await supabase
    .from("books")
    .select("id", { count: "exact", head: true })
    .eq("uploaded_by", userId)
    .gte("created_at", weekAgo.toISOString());

  if (error) return 0;
  return count ?? 0;
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

/** Max concurrent books being processed per user. */
export const MAX_CONCURRENT_PROCESSING = Number(process.env.MAX_CONCURRENT_PROCESSING) || 3;
