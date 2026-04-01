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
 * Record a usage event. Just inserts a row — no balance deduction.
 * Balance is derived at read time from allowance - SUM(cost since reset).
 */
export async function recordUsage(params: RecordUsageParams): Promise<{ success: boolean; costDollars: number }> {
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

  if (costDollars <= 0) return { success: true, costDollars: 0 };

  const supabase = createServiceClient();

  const { error } = await supabase.from("usage_records").insert({
    user_id: userId ?? null,
    cost_dollars: costDollars,
    usage_type: usageType,
    model: model ?? null,
    input_tokens: inputTokens ?? null,
    output_tokens: outputTokens ?? null,
    cached_input_tokens: cachedInputTokens ?? null,
    reference_id: referenceId ?? null,
  });

  if (error) {
    console.error("[usage] failed to insert usage_record:", error);
    return { success: false, costDollars };
  }

  return { success: true, costDollars };
}
