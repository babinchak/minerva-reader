/**
 * Cost-based usage tracking.
 * All costs stored in cents. User sees: included (no cost) or on-demand (cost).
 */

import { createServiceClient } from "@/lib/supabase/server";
import { reportOverageUsageToStripe } from "@/lib/stripe-usage";

export type UsageType = "chat" | "summary_book" | "summary_chapter" | "embedding" | "upload";

/** OpenAI pricing per 1M tokens (input, output) in cents. Approximate. */
const MODEL_CENTS_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 15, output: 60 },
  "gpt-4o": { input: 250, output: 1000 },
  "gpt-4.1": { input: 250, output: 1000 },
  "text-embedding-3-small": { input: 2, output: 0 },
  "text-embedding-3-large": { input: 13, output: 0 },
};

const DEFAULT_CENTS = { input: 50, output: 200 };

function getCentsPer1M(model: string): { input: number; output: number } {
  return MODEL_CENTS_PER_1M[model] ?? DEFAULT_CENTS;
}

/**
 * Calculate cost in cents from token counts.
 */
export function costCentsFromTokens(
  model: string,
  inputTokens: number,
  outputTokens: number,
  isAgentic = false
): number {
  const rate = getCentsPer1M(model);
  let cents = (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
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
  userId: string;
  costCents: number;
  usageType: UsageType;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  referenceId?: string;
  /** For uploads: book title for display */
  bookTitle?: string;
}

export interface RecordUsageResult {
  success: boolean;
  included: boolean;
  costCents: number;
}

/**
 * Record usage and deduct from allowance/on-demand.
 * Returns result with success, included (from allowance vs on-demand), and costCents.
 */
export async function recordUsage(params: RecordUsageParams): Promise<RecordUsageResult> {
  const {
    userId,
    costCents,
    usageType,
    model,
    inputTokens,
    outputTokens,
    referenceId,
  } = params;

  if (costCents <= 0) return { success: true, included: true, costCents: 0 };

  const supabase = createServiceClient();
  const { ensureUserCredits } = await import("@/lib/credits");
  await ensureUserCredits(userId);

  const { data: row } = await supabase
    .from("user_credits")
    .select("balance_cents, allowance_cents, on_demand_limit_type, on_demand_limit_cents, on_demand_cents_this_period")
    .eq("user_id", userId)
    .single();

  if (!row) return { success: false, included: true, costCents };

  const balanceCents = row.balance_cents ?? 0;
  const limitType = (row.on_demand_limit_type as string) || "disabled";
  const limitCents = row.on_demand_limit_cents ?? 1000;
  const onDemandSoFar = row.on_demand_cents_this_period ?? 0;

  const newBalanceCents = balanceCents - costCents;
  const isOnDemand = newBalanceCents < 0;

  if (isOnDemand) {
    if (limitType === "disabled") return { success: false, included: true, costCents };
    if (limitType === "fixed") {
      const wouldBeTotal = onDemandSoFar + (-newBalanceCents);
      if (wouldBeTotal > limitCents) return { success: false, included: false, costCents };
    }
  }

  const updateData: Record<string, unknown> = {
    balance_cents: newBalanceCents,
    updated_at: new Date().toISOString(),
  };
  if (isOnDemand) {
    updateData.on_demand_cents_this_period = onDemandSoFar + (-newBalanceCents);
  }

  const { error: updateError } = await supabase
    .from("user_credits")
    .update(updateData)
    .eq("user_id", userId);

  if (updateError) return { success: false, included: true, costCents };

  // Only insert into usage_records for non-chat (uploads, summaries, embeddings).
  // Chat usage is stored on chat_messages by the client.
  if (usageType !== "chat") {
    await supabase.from("usage_records").insert({
      user_id: userId,
      cost_cents: costCents,
      usage_type: usageType,
      model: model ?? null,
      input_tokens: inputTokens ?? null,
      output_tokens: outputTokens ?? null,
      reference_id: referenceId ?? null,
      included: !isOnDemand,
    });
  }

  if (isOnDemand) {
    const onDemandCents = -newBalanceCents;
    reportOverageUsageToStripe(userId, onDemandCents).catch(() => {});
  }

  return { success: true, included: !isOnDemand, costCents };
}

/*
 * Backend integration for summaries and embeddings:
 *
 * 1. Book upload (total cost): After summaries + embeddings are done, call:
 *    recordUsage({ userId, costCents: totalCents, usageType: "upload", referenceId: bookId })
 *    This deducts from allowance and inserts into usage_records for the usage UI.
 *
 * 2. Or update the book directly: SET processing_cost_cents = X, processing_cost_included = true/false
 *    The usage UI reads from both usage_records and books.processing_cost_cents.
 *
 * 3. Or record per-step: Call recordUsage for each summary_book, summary_chapter, embedding
 *    with the cost for that step. referenceId = bookId for all.
 */
