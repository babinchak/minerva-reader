/**
 * Cost-based usage tracking.
 * All costs stored in cents. Balance is derived: allowance - SUM(cost since reset).
 */

import { createServiceClient } from "@/lib/supabase/server";

export type UsageType = "chat" | "chat_agentic" | "summary_book" | "summary_chapter" | "embedding" | "upload";

/** OpenAI pricing per 1M tokens (input, cachedInput, output) in cents. */
const MODEL_CENTS_PER_1M: Record<string, { input: number; cachedInput: number; output: number }> = {
  "gpt-4o-mini": { input: 15, cachedInput: 1.5, output: 60 },
  "gpt-4o": { input: 250, cachedInput: 125, output: 1000 },
  "gpt-4.1": { input: 250, cachedInput: 25, output: 1000 },
  "gpt-5.4-mini": { input: 75, cachedInput: 7.5, output: 450 },
  "gpt-5.4-nano": { input: 20, cachedInput: 2, output: 125 },
  "gpt-5": { input: 175, cachedInput: 17.5, output: 1400 },
  "gpt-5.4": { input: 250, cachedInput: 25, output: 1500 },
  "text-embedding-3-small": { input: 2, cachedInput: 0, output: 0 },
  "text-embedding-3-large": { input: 13, cachedInput: 0, output: 0 },
};

const DEFAULT_CENTS = { input: 50, cachedInput: 5, output: 200 };

function getCentsPer1M(model: string): { input: number; cachedInput: number; output: number } {
  return MODEL_CENTS_PER_1M[model] ?? DEFAULT_CENTS;
}

/**
 * Calculate cost in cents from token counts.
 * cachedInputTokens is a subset of inputTokens — those tokens are charged at the cached rate instead.
 */
export function costCentsFromTokens(
  model: string,
  inputTokens: number,
  outputTokens: number,
  isAgentic = false,
  cachedInputTokens = 0
): number {
  const rate = getCentsPer1M(model);
  const uncachedInputTokens = inputTokens - cachedInputTokens;
  let cents =
    (uncachedInputTokens * rate.input +
      cachedInputTokens * rate.cachedInput +
      outputTokens * rate.output) /
    1_000_000;
  if (isAgentic) cents *= 1.5;
  return Math.max(1, Math.round(cents));
}

/**
 * Calculate cost for embeddings (tokens are input-only).
 */
export function costCentsFromEmbeddingTokens(model: string, tokens: number): number {
  const rate = getCentsPer1M(model);
  const cents = (tokens * rate.input) / 1_000_000;
  return Math.max(1, Math.round(cents));
}

export interface RecordUsageParams {
  userId?: string | null;
  costCents: number;
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
export async function recordUsage(params: RecordUsageParams): Promise<{ success: boolean; costCents: number }> {
  const {
    userId,
    costCents,
    usageType,
    model,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    referenceId,
  } = params;

  if (costCents <= 0) return { success: true, costCents: 0 };

  const supabase = createServiceClient();

  const { error } = await supabase.from("usage_records").insert({
    user_id: userId ?? null,
    cost_cents: costCents,
    usage_type: usageType,
    model: model ?? null,
    input_tokens: inputTokens ?? null,
    output_tokens: outputTokens ?? null,
    cached_input_tokens: cachedInputTokens ?? null,
    reference_id: referenceId ?? null,
  });

  if (error) {
    console.error("[usage] failed to insert usage_record:", error);
    return { success: false, costCents };
  }

  return { success: true, costCents };
}
