/**
 * Credits/usage system: tier resolution, balance checks.
 * Uses cost_cents for tracking. Legacy credits kept for migration.
 */

import { reportOverageUsageToStripe } from "@/lib/stripe-usage";
import { createServiceClient } from "@/lib/supabase/server";

export type UserTier = "anonymous" | "free" | "paid";

export type OnDemandLimitType = "disabled" | "fixed" | "unlimited";

/** Monthly allowance in cents. $20 = 2000, $5 = 500. */
export const ALLOWANCE_CENTS = {
  free: Number(process.env.ALLOWANCE_CENTS_FREE) || 500,
  paid: Number(process.env.ALLOWANCE_CENTS_PAID) || 2000,
} as const;

export interface UserCredits {
  balance: number;
  balanceCents: number;
  tier: UserTier;
  monthlyAllowance: number;
  allowanceCents: number;
  allowanceResetAt: Date | null;
  onDemandLimitType: OnDemandLimitType;
  onDemandLimitCents: number;
  onDemandCreditsThisPeriod: number;
  onDemandCentsThisPeriod: number;
}

/** Model env vars per tier. Map to actual OpenAI model IDs. */
export const TIER_MODELS = {
  anonymous: process.env.OPENAI_MODEL_ANONYMOUS || "gpt-5-mini",
  free: process.env.OPENAI_MODEL_FREE || "gpt-5-mini",
  paid: process.env.OPENAI_MODEL_PAID || "gpt-5.2",
} as const;

/** Monthly allowance per tier (credits). */
export const TIER_ALLOWANCES = {
  free: Number(process.env.CREDITS_FREE_MONTHLY) || 5_000,
  paid: Number(process.env.CREDITS_PAID_MONTHLY) || 50_000,
} as const;

/** Credit cost per 1k tokens by model (input, output). Approximate. */
export const MODEL_CREDIT_RATES: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.1, output: 0.2 },
  "gpt-4o": { input: 0.5, output: 1.0 },
  "gpt-4.1": { input: 0.5, output: 1.0 },
  "gpt-5-mini": { input: 0.1, output: 0.2 },
  "gpt-5-nano": { input: 0.05, output: 0.1 },
  "gpt-5": { input: 0.5, output: 1.0 },
  "gpt-5.2": { input: 0.5, output: 1.0 },
  "gpt-5.4": { input: 0.5, output: 1.0 },
};

/** Agentic multiplier (tool calls add overhead). */
export const AGENTIC_MULTIPLIER = 1.5;

/** Estimated credits per agentic request (when usage not available from stream). */
export const AGENTIC_ESTIMATED_CREDITS =
  Number(process.env.CREDITS_AGENTIC_ESTIMATE) || 100;

/** Estimated cost in cents per agentic request ($1 = 100 cents). */
export const AGENTIC_ESTIMATED_CENTS =
  Number(process.env.AGENTIC_ESTIMATED_CENTS) || 100;

/** Cents per 1000 on-demand credits (legacy). e.g. 10 = $0.10/1k credits. */
export const CREDITS_OVERAGE_CENTS_PER_1000 =
  Number(process.env.CREDITS_OVERAGE_CENTS_PER_1000) || 10;

const DEFAULT_RATE = { input: 0.2, output: 0.4 };

function getCreditRate(model: string): { input: number; output: number } {
  return MODEL_CREDIT_RATES[model] ?? DEFAULT_RATE;
}

/** True when FREE_BETA_MODE env var is set (e.g. "1" or "true"). */
export function isFreeBetaMode(): boolean {
  const v = process.env.FREE_BETA_MODE;
  return !!(v && (v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes"));
}

/**
 * Resolve tier from user. Anonymous if no user.
 * In free beta mode, authenticated users are treated as paid.
 */
export async function getTier(userId: string | null): Promise<UserTier> {
  if (!userId) return "anonymous";
  if (isFreeBetaMode()) return "paid";

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
 * Get user credits. Creates row and applies allowance if needed.
 */
export async function getCredits(userId: string): Promise<UserCredits | null> {
  const supabase = createServiceClient();
  await ensureUserCredits(userId);

  const { data, error } = await supabase
    .from("user_credits")
    .select("balance, balance_cents, tier, monthly_allowance, allowance_cents, allowance_reset_at, on_demand_limit_type, on_demand_limit_cents, on_demand_credits_this_period, on_demand_cents_this_period")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  const tier = (data.tier as UserTier) || "free";
  const allowanceCents = data.allowance_cents ?? (tier === "paid" ? ALLOWANCE_CENTS.paid : ALLOWANCE_CENTS.free);

  return {
    balance: data.balance ?? 0,
    balanceCents: data.balance_cents ?? 0,
    tier,
    monthlyAllowance: data.monthly_allowance ?? 0,
    allowanceCents,
    allowanceResetAt: data.allowance_reset_at
      ? new Date(data.allowance_reset_at)
      : null,
    onDemandLimitType: (data.on_demand_limit_type as OnDemandLimitType) || "disabled",
    onDemandLimitCents: data.on_demand_limit_cents ?? 1000,
    onDemandCreditsThisPeriod: data.on_demand_credits_this_period ?? 0,
    onDemandCentsThisPeriod: data.on_demand_cents_this_period ?? 0,
  };
}

/**
 * Ensure user has a user_credits row. Apply monthly allowance if reset is due.
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
  const allowance = tier === "paid" ? TIER_ALLOWANCES.paid : TIER_ALLOWANCES.free;
  const allowanceCents = tier === "paid" ? ALLOWANCE_CENTS.paid : ALLOWANCE_CENTS.free;

  if (!existing) {
    const resetAt = new Date(now);
    resetAt.setMonth(resetAt.getMonth() + 1);

    // Insert only - avoid overwriting tier=paid from a concurrent webhook (upsert would overwrite)
    const { error: insertError } = await supabase.from("user_credits").insert({
      user_id: userId,
      balance: allowance,
      balance_cents: allowanceCents,
      tier: "free",
      monthly_allowance: TIER_ALLOWANCES.free,
      allowance_cents: allowanceCents,
      allowance_reset_at: resetAt.toISOString(),
      updated_at: now.toISOString(),
    });

    if (insertError) {
      // 23505 = unique_violation - row exists (e.g. from concurrent webhook)
      if (insertError.code === "23505" || insertError.message?.includes("duplicate")) return;
      throw insertError;
    }
    await supabase.from("credit_transactions").insert({
      user_id: userId,
      amount: TIER_ALLOWANCES.free,
      type: "allowance",
      metadata: { reason: "initial" },
    });
    return;
  }

  const resetAt = existing.allowance_reset_at
    ? new Date(existing.allowance_reset_at)
    : null;

  if (resetAt && now >= resetAt) {
    const nextReset = new Date(now);
    nextReset.setMonth(nextReset.getMonth() + 1);

    const { data: row } = await supabase
      .from("user_credits")
      .select("balance, balance_cents")
      .eq("user_id", userId)
      .single();

    const currentBalance = row?.balance ?? 0;
    const currentBalanceCents = row?.balance_cents ?? 0;
    const tierNow = (existing?.tier as UserTier) || "free";
    const allowanceCentsNow = tierNow === "paid" ? ALLOWANCE_CENTS.paid : ALLOWANCE_CENTS.free;

    await supabase
      .from("user_credits")
      .update({
        balance: currentBalance + allowance,
        balance_cents: currentBalanceCents + allowanceCentsNow,
        monthly_allowance: allowance,
        allowance_cents: allowanceCentsNow,
        allowance_reset_at: nextReset.toISOString(),
        on_demand_credits_this_period: 0,
        on_demand_cents_this_period: 0,
        updated_at: now.toISOString(),
      })
      .eq("user_id", userId);

    await supabase.from("credit_transactions").insert({
      user_id: userId,
      amount: allowance,
      type: "allowance",
      metadata: { reason: "monthly_reset" },
    });
  }
}

/**
 * Check if user has at least `amount` credits (from balance only).
 */
export async function hasCredits(userId: string, amount: number): Promise<boolean> {
  const credits = await getCredits(userId);
  if (!credits) return false;
  return credits.balance >= amount;
}

/** Max on-demand credits allowed for a fixed limit (cents -> credits). */
function maxOnDemandCreditsForFixedLimit(limitCents: number): number {
  if (limitCents <= 0) return 0;
  const units = limitCents / CREDITS_OVERAGE_CENTS_PER_1000;
  return Math.floor(units * 1000);
}

/**
 * Check if user can afford `amount` credits (balance + on-demand if enabled).
 * @deprecated Use canAffordCents for cost-based checks.
 */
export async function canAffordCredits(userId: string, amount: number): Promise<boolean> {
  const credits = await getCredits(userId);
  if (!credits) return false;
  if (credits.balance >= amount) return true;
  if (credits.onDemandLimitType === "disabled") return false;

  const shortfall = amount - credits.balance;
  const wouldBeOnDemand = credits.onDemandCreditsThisPeriod + shortfall;

  if (credits.onDemandLimitType === "unlimited") return true;
  if (credits.onDemandLimitType === "fixed") {
    const max = maxOnDemandCreditsForFixedLimit(credits.onDemandLimitCents);
    return wouldBeOnDemand <= max;
  }
  return false;
}

export type UsageMode = "included" | "on_demand";

/**
 * Get current usage mode: included (balance > 0) or on_demand (balance <= 0).
 */
export async function getUsageMode(userId: string): Promise<UsageMode | null> {
  const credits = await getCredits(userId);
  if (!credits) return null;
  return credits.balanceCents > 0 ? "included" : "on_demand";
}

/**
 * Check if user can make a request.
 * - Free beta mode: always allow.
 * - Included mode (balance > 0): always allow.
 * - On-demand mode (balance <= 0): use canAffordCents with estimated cost.
 */
export async function canMakeRequest(
  userId: string,
  estimatedCostCents: number
): Promise<boolean> {
  if (isFreeBetaMode()) return true;
  const credits = await getCredits(userId);
  if (!credits) return false;
  if (credits.balanceCents > 0) return true; // included mode - no cost check
  return canAffordCents(userId, estimatedCostCents); // on-demand - check limit
}

/**
 * Check if user can afford `costCents` (balance_cents + on-demand if enabled).
 * Use for on-demand mode when you need to verify a specific cost.
 */
export async function canAffordCents(userId: string, costCents: number): Promise<boolean> {
  const credits = await getCredits(userId);
  if (!credits) return false;
  if (credits.balanceCents >= costCents) return true;
  if (credits.onDemandLimitType === "disabled") return false;

  const shortfall = costCents - credits.balanceCents;
  const wouldBeOnDemand = credits.onDemandCentsThisPeriod + shortfall;

  if (credits.onDemandLimitType === "unlimited") return true;
  if (credits.onDemandLimitType === "fixed") {
    return wouldBeOnDemand <= credits.onDemandLimitCents;
  }
  return false;
}

/**
 * Deduct credits. Returns true if successful.
 * When balance is insufficient, uses on-demand if enabled (balance can go negative).
 */
export async function deductCredits(
  userId: string,
  amount: number,
  type: "upload" | "ai",
  referenceId?: string,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  if (amount <= 0) return true;

  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("user_credits")
    .select("balance, on_demand_limit_type, on_demand_limit_cents, on_demand_credits_this_period")
    .eq("user_id", userId)
    .single();

  if (!row) return false;

  const balance = row.balance ?? 0;
  const limitType = (row.on_demand_limit_type as OnDemandLimitType) || "disabled";
  const limitCents = row.on_demand_limit_cents ?? 1000;
  const onDemandSoFar = row.on_demand_credits_this_period ?? 0;

  const newBalance = balance - amount;

  // If balance would go negative, check on-demand
  if (newBalance < 0) {
    if (limitType === "disabled") return false;

    const onDemandUsed = -newBalance; // credits drawn from on-demand
    const wouldBeTotal = onDemandSoFar + onDemandUsed;

    if (limitType === "fixed") {
      const max = maxOnDemandCreditsForFixedLimit(limitCents);
      if (wouldBeTotal > max) return false;
    }
  }

  const updateData: Record<string, unknown> = {
    balance: newBalance,
    updated_at: new Date().toISOString(),
  };
  if (newBalance < 0) {
    updateData.on_demand_credits_this_period = onDemandSoFar + (-newBalance);
  }

  const { error: updateError } = await supabase
    .from("user_credits")
    .update(updateData)
    .eq("user_id", userId);

  if (updateError) return false;

  await supabase.from("credit_transactions").insert({
    user_id: userId,
    amount: -amount,
    type,
    reference_id: referenceId ?? null,
    metadata: { ...(metadata ?? {}), on_demand: newBalance < 0 },
  });

  // Report on-demand usage to Stripe for metered billing (fire-and-forget)
  if (newBalance < 0) {
    reportOverageUsageToStripe(userId, -newBalance).catch(() => {});
  }

  return true;
}

/**
 * Add credits (e.g. top-up). Returns new balance.
 */
export async function addCredits(
  userId: string,
  amount: number,
  type: "topup" | "allowance",
  metadata?: Record<string, unknown>
): Promise<number | null> {
  if (amount <= 0) return null;

  const supabase = createServiceClient();
  await ensureUserCredits(userId);

  const { data: row } = await supabase
    .from("user_credits")
    .select("balance")
    .eq("user_id", userId)
    .single();

  if (!row) return null;

  const newBalance = (row.balance ?? 0) + amount;

  await supabase
    .from("user_credits")
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  await supabase.from("credit_transactions").insert({
    user_id: userId,
    amount,
    type,
    metadata: metadata ?? null,
  });

  return newBalance;
}

/**
 * Update on-demand limit for a user. Paid tier only.
 */
export async function updateOnDemandLimit(
  userId: string,
  limitType: OnDemandLimitType,
  limitCents?: number
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
  if (limitType === "fixed" && typeof limitCents === "number" && limitCents >= 0) {
    update.on_demand_limit_cents = limitCents;
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
 * Count agentic (deep mode) requests today for user.
 */
export async function countAgenticRequestsToday(userId: string): Promise<number> {
  const supabase = createServiceClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("credit_transactions")
    .select("id, metadata")
    .eq("user_id", userId)
    .eq("type", "ai")
    .gte("created_at", today.toISOString());

  if (error) return 0;
  const rows = (data ?? []) as { metadata?: { agentic?: boolean } }[];
  return rows.filter((r) => r.metadata?.agentic === true).length;
}

/**
 * Calculate credits for AI usage from token counts.
 */
export function creditsForAiUsage(
  model: string,
  inputTokens: number,
  outputTokens: number,
  isAgentic: boolean
): number {
  const rate = getCreditRate(model);
  let credits =
    (inputTokens / 1000) * rate.input + (outputTokens / 1000) * rate.output;
  if (isAgentic) credits *= AGENTIC_MULTIPLIER;
  return Math.ceil(credits);
}
