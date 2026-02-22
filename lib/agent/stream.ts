import type { BaseMessage } from "@langchain/core/messages";
import type { AIMessage } from "@langchain/core/messages";
import type { AgentState } from "./graph";

type AgentGraph = ReturnType<typeof import("./graph").createAgentGraph>;

type ToolCallChunk = { name?: string; args?: Record<string, unknown>; id?: string };

function getToolCallPayload(tc: ToolCallChunk): { type: "tool_call"; toolName: string; args: Record<string, unknown>; id?: string } | null {
  const name = typeof tc.name === "string" ? tc.name : undefined;
  if (!name) return null;
  const args = tc.args && typeof tc.args === "object" ? (tc.args as Record<string, unknown>) : {};
  return { type: "tool_call", toolName: name, args, id: typeof tc.id === "string" ? tc.id : undefined };
}

/**
 * Stream LangGraph agent output and encode as SSE compatible with handleStreamingResponse.
 * Emits data: { content } for assistant text, data: { type: "status", message } for Cursor-style stage updates.
 * Emits data: { type: "usage_tokens", inputTokens, outputTokens } before [DONE] when available from AIMessage.usage_metadata.
 */
export async function* streamAgentToSSE(
  graph: AgentGraph,
  initialState: AgentState
): AsyncGenerator<string, void, unknown> {
  const stream = await graph.stream(initialState as unknown as Parameters<AgentGraph["stream"]>[0], {
    streamMode: ["messages", "updates"],
    configurable: { thread_id: crypto.randomUUID() },
  });

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for await (const payload of stream) {
    // LangGraph yields [namespace?, mode, chunk] - 3 elements with subgraphs, 2 without
    const isTuple = Array.isArray(payload) && payload.length >= 2;
    const mode = isTuple
      ? (payload.length >= 3 ? (payload as [unknown, string, unknown])[1] : (payload as [string, unknown])[0])
      : undefined;
    const chunk = isTuple
      ? (payload.length >= 3 ? (payload as [unknown, unknown, unknown])[2] : (payload as [unknown, unknown])[1])
      : payload;

    if (mode === "updates" && chunk && typeof chunk === "object") {
      const updates = chunk as Record<string, { messages?: unknown[] }>;
      if (updates.agent?.messages?.length) {
        const last = updates.agent.messages[updates.agent.messages.length - 1] as AIMessage;
        const toolCalls = last?.tool_calls;
        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          for (const tc of toolCalls) {
            const payload = getToolCallPayload(tc as ToolCallChunk);
            if (payload) {
              yield `data: ${JSON.stringify(payload)}\n\n`;
            }
          }
        } else if (typeof last?.content === "string" && last.content.length > 0) {
          yield `data: ${JSON.stringify({ type: "status", message: "Generating response..." })}\n\n`;
        }
        // Accumulate token usage from AIMessage.usage_metadata or response_metadata.tokenUsage
        const um = last?.usage_metadata as { input_tokens?: number; output_tokens?: number } | undefined;
        const rm = last?.response_metadata as { tokenUsage?: { promptTokens?: number; completionTokens?: number } } | undefined;
        if (um) {
          totalInputTokens += um.input_tokens ?? 0;
          totalOutputTokens += um.output_tokens ?? 0;
        } else if (rm?.tokenUsage) {
          totalInputTokens += rm.tokenUsage.promptTokens ?? 0;
          totalOutputTokens += rm.tokenUsage.completionTokens ?? 0;
        }
      }
      if (updates.tools?.messages?.length) {
        yield `data: ${JSON.stringify({ type: "status", message: "Processing results..." })}\n\n`;
      }
    }

    if (mode === "messages" || !mode) {
      const msgOrTuple = (chunk as { messages?: unknown })?.messages ?? chunk;
      const messages = Array.isArray(msgOrTuple) ? msgOrTuple : [msgOrTuple];
      for (const m of messages) {
        const msg: BaseMessage | [BaseMessage, Record<string, unknown>] = m;
        const baseMsg = Array.isArray(msg) ? msg[0] : msg;
        // Only emit content from AI (assistant) messages, not ToolMessages (search results, etc.)
        if (baseMsg?.type !== "ai") continue;
        const content = typeof baseMsg?.content === "string" ? baseMsg.content : "";
        if (content) {
          yield `data: ${JSON.stringify({ content })}\n\n`;
        }
      }
    }
  }

  if (totalInputTokens > 0 || totalOutputTokens > 0) {
    yield `data: ${JSON.stringify({ type: "usage_tokens", inputTokens: totalInputTokens, outputTokens: totalOutputTokens })}\n\n`;
  }
  yield `data: [DONE]\n\n`;
}
