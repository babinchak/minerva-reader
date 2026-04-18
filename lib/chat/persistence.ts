import type { SupabaseClient } from "@supabase/supabase-js";

export interface AssistantMessageUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  costDollars?: number | null;
  model?: string;
  chatMode?: string;
}

export interface PersistedToolCall {
  toolName: string;
  args?: Record<string, unknown>;
  id?: string;
  resultSummary?: unknown;
}

/**
 * Insert a placeholder assistant row so the generation has a target to stream
 * into. Returns the row id, or null if persistence is not possible (no chat,
 * private chat, or insert failed).
 */
export async function insertAssistantPlaceholder(
  supabase: SupabaseClient,
  params: {
    chatId: string;
    messageIndex: number;
    chatMode: string;
    model: string;
  }
): Promise<string | null> {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      chat_id: params.chatId,
      role: "assistant",
      content: "",
      message_index: params.messageIndex,
      chat_mode: params.chatMode,
      model: params.model,
      is_complete: false,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id as string;
}

/**
 * Mark a streaming assistant row complete with the final content + usage.
 */
export async function finalizeAssistantMessage(
  supabase: SupabaseClient,
  messageId: string,
  content: string,
  usage?: AssistantMessageUsage,
  toolCalls?: PersistedToolCall[]
): Promise<void> {
  await supabase
    .from("chat_messages")
    .update({
      content,
      cost_dollars: usage?.costDollars ?? null,
      input_tokens: usage?.inputTokens ?? null,
      output_tokens: usage?.outputTokens ?? null,
      model: usage?.model ?? null,
      chat_mode: usage?.chatMode ?? null,
      tool_calls: toolCalls && toolCalls.length > 0 ? toolCalls : null,
      is_complete: true,
    })
    .eq("id", messageId);
}

/**
 * Check whether a user has requested to stop this assistant message.
 * Called between agent steps (or every ~N chunks) by streaming routes.
 */
export async function isStopRequested(
  supabase: SupabaseClient,
  messageId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("chat_messages")
    .select("stop_requested_at")
    .eq("id", messageId)
    .maybeSingle();
  return Boolean(data?.stop_requested_at);
}
