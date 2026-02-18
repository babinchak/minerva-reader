/**
 * Credits system: tier resolution, balance checks, deductions.
 * Credits are abstract units (not OpenAI tokens). Used for AI usage and uploads.
 */

import { createServiceClient } from "@/lib/supabase/server";

export type UserTier = "anonymous" | "free" | "paid";

export interface UserCredits {
  balance: number;
  tier: UserTier;
  monthlyAllowance: number;
  allowanceResetAt: Date | null;
}

/** Model env vars per tier. Map to actual OpenAI model IDs. */
export const TIER_MODELS = {
  anonymous: process.env.OPENAI_MODEL_ANONYMOUS || "gpt-4o-mini",
  free: process.env.OPENAI_MODEL_FREE || "gpt-4o-mini",
  paid: process.env.OPENAI_MODEL_PAID || "gpt-4o",
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
  "gpt-5.2": { input: 0.5, output: 1.0 },
};

/** Agentic multiplier (tool calls add overhead). */
export const AGENTIC_MULTIPLIER = 1.5;

/** Estimated credits per agentic request (when usage not available from stream). */
export const AGENTIC_ESTIMATED_CREDITS =
  Number(process.env.CREDITS_AGENTIC_ESTIMATE) || 100;

const DEFAULT_RATE = { input: 0.2, output: 0.4 };

function getCreditRate(model: string): { input: number; output: number } {
  return MODEL_CREDIT_RATES[model] ?? DEFAULT_RATE;
}

/**
 * Resolve tier from user. Anonymous if no user.
 */
export async function getTier(userId: string | null): Promise<UserTier> {
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
 * Get user credits. Creates row and applies allowance if needed.
 */
export async function getCredits(userId: string): Promise<UserCredits | null> {
  const supabase = createServiceClient();
  await ensureUserCredits(userId);

  const { data, error } = await supabase
    .from("user_credits")
    .select("balance, tier, monthly_allowance, allowance_reset_at")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  return {
    balance: data.balance ?? 0,
    tier: (data.tier as UserTier) || "free",
    monthlyAllowance: data.monthly_allowance ?? 0,
    allowanceResetAt: data.allowance_reset_at
      ? new Date(data.allowance_reset_at)
      : null,
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

  if (!existing) {
    const resetAt = new Date(now);
    resetAt.setMonth(resetAt.getMonth() + 1);

    // Insert only - avoid overwriting tier=paid from a concurrent webhook (upsert would overwrite)
    const { error: insertError } = await supabase.from("user_credits").insert({
      user_id: userId,
      balance: allowance,
      tier: "free",
      monthly_allowance: TIER_ALLOWANCES.free,
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
      .select("balance")
      .eq("user_id", userId)
      .single();

    const currentBalance = row?.balance ?? 0;

    await supabase
      .from("user_credits")
      .update({
        balance: currentBalance + allowance,
        monthly_allowance: allowance,
        allowance_reset_at: nextReset.toISOString(),
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
 * Check if user has at least `amount` credits.
 */
export async function hasCredits(userId: string, amount: number): Promise<boolean> {
  const credits = await getCredits(userId);
  if (!credits) return false;
  return credits.balance >= amount;
}

/**
 * Deduct credits. Returns true if successful.
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
    .select("balance")
    .eq("user_id", userId)
    .single();

  if (!row) return false;

  const newBalance = (row.balance ?? 0) - amount;

  const { error: updateError } = await supabase
    .from("user_credits")
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (updateError) return false;

  await supabase.from("credit_transactions").insert({
    user_id: userId,
    amount: -amount,
    type,
    reference_id: referenceId ?? null,
    metadata: metadata ?? null,
  });

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
