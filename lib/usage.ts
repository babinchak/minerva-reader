/**
 * Cost-based usage tracking.
 * All costs stored in dollars (double precision). Balance is derived: allowance - SUM(cost since reset).
 */

import { createServiceClient } from "@/lib/supabase/server";

export type UsageType = "chat" | "chat_agentic" | "summary_book" | "summary_chapter" | "embedding" | "upload";

/** OpenAI pricing per 1M tokens (input, cachedInput, output) in dollars. */
const MODEL_DOLLARS_PER_1M: Record<string, { input: number; cachedInput: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.015, output: 0.60 },
  "gpt-4o": { input: 2.50, cachedInput: 1.25, output: 10.00 },
  "gpt-4.1": { input: 2.50, cachedInput: 0.25, output: 10.00 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.50 },
  "gpt-5.4-nano": { input: 0.20, cachedInput: 0.02, output: 1.25 },
  "gpt-5": { input: 1.75, cachedInput: 0.175, output: 14.00 },
  "gpt-5.4": { input: 2.50, cachedInput: 0.25, output: 15.00 },
  "text-embedding-3-small": { input: 0.02, cachedInput: 0, output: 0 },
  "text-embedding-3-large": { input: 0.13, cachedInput: 0, output: 0 },
};

const DEFAULT_DOLLARS = { input: 0.50, cachedInput: 0.05, output: 2.00 };

function getDollarsPer1M(model: string): { input: number; cachedInput: number; output: number } {
  return MODEL_DOLLARS_PER_1M[model] ?? DEFAULT_DOLLARS;
}

/**
 * Calculate cost in dollars from token counts.
 * cachedInputTokens is a subset of inputTokens — those tokens are charged at the cached rate instead.
 */
export function costDollarsFromTokens(
  model: string,
  inputTokens: number,
  outputTokens: number,
  isAgentic = false,
  cachedInputTokens = 0
): number {
  const rate = getDollarsPer1M(model);
  const uncachedInputTokens = inputTokens - cachedInputTokens;
  let dollars =
    (uncachedInputTokens * rate.input +
      cachedInputTokens * rate.cachedInput +
      outputTokens * rate.output) /
    1_000_000;
  if (isAgentic) dollars *= 1.5;
  return dollars;
}

/**
 * Calculate cost for embeddings (tokens are input-only).
 */
export function costDollarsFromEmbeddingTokens(model: string, tokens: number): number {
  const rate = getDollarsPer1M(model);
  return (tokens * rate.input) / 1_000_000;
}

export interface RecordUsageParams {
  userId?: string | null;
  costDollars: number;
  usageType: UsageType;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  referenceId?: string;
}

/**
 * Record a usage event and deduct from the user's balances.
 * Deducts from included_balance first, then extra_usage_balance.
 * Returns whether the cost was included or drawn from extra usage.
 */
export async function recordUsage(params: RecordUsageParams): Promise<{ success: boolean; costDollars: number; included: boolean }> {
  const {
    userId,
    costDollars,
    usageType,
    model,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    referenceId,
  } = params;

  if (costDollars <= 0) return { success: true, costDollars: 0, included: true };
  if (!userId) {
    // Anonymous usage — just insert the record, no balance to deduct
    const supabase = createServiceClient();
    await supabase.from("usage_records").insert({
      user_id: null,
      cost_dollars: costDollars,
      usage_type: usageType,
      model: model ?? null,
      input_tokens: inputTokens ?? null,
      output_tokens: outputTokens ?? null,
      cached_input_tokens: cachedInputTokens ?? null,
      reference_id: referenceId ?? null,
      included: false,
    });
    return { success: true, costDollars, included: false };
  }

  const supabase = createServiceClient();

  // Get current balances
  const { data: credits } = await supabase
    .from("user_credits")
    .select("included_balance, extra_usage_balance, extra_usage_spent")
    .eq("user_id", userId)
    .single();

  const includedBalance = credits?.included_balance ?? 0;
  const extraBalance = credits?.extra_usage_balance ?? 0;

  let included = true;
  let deductFromIncluded = 0;
  let deductFromExtra = 0;

  if (includedBalance >= costDollars) {
    // Fully covered by included balance
    deductFromIncluded = costDollars;
  } else if (includedBalance > 0) {
    // Partially covered — use remaining included, rest from extra
    deductFromIncluded = includedBalance;
    deductFromExtra = costDollars - includedBalance;
    included = false;
  } else {
    // Entirely from extra usage
    deductFromExtra = costDollars;
    included = false;
  }

  // Insert usage record
  const { error } = await supabase.from("usage_records").insert({
    user_id: userId,
    cost_dollars: costDollars,
    usage_type: usageType,
    model: model ?? null,
    input_tokens: inputTokens ?? null,
    output_tokens: outputTokens ?? null,
    cached_input_tokens: cachedInputTokens ?? null,
    reference_id: referenceId ?? null,
    included,
  });

  if (error) {
    console.error("[usage] failed to insert usage_record:", error);
    return { success: false, costDollars, included };
  }

  // Deduct from balances
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (deductFromIncluded > 0) {
    update.included_balance = Math.max(0, includedBalance - deductFromIncluded);
  }
  if (deductFromExtra > 0) {
    update.extra_usage_balance = Math.max(0, extraBalance - deductFromExtra);
    update.extra_usage_spent = (credits?.extra_usage_spent ?? 0) + deductFromExtra;
  }

  await supabase
    .from("user_credits")
    .update(update)
    .eq("user_id", userId);

  return { success: true, costDollars, included };
}
