import type { BaseMessage } from "@langchain/core/messages";
import type { AIMessage } from "@langchain/core/messages";
import type { AgentState } from "./graph";

type AgentGraph = ReturnType<typeof import("./graph").createAgentGraph>;

const TOOL_STATUS_LABELS: Record<string, string> = {
  vector_search: "Searching book...",
  text_search: "Searching text...",
  web_search: "Searching web...",
};

function emitStatus(toolNames: string[]): string {
  const labels = toolNames
    .map((n) => TOOL_STATUS_LABELS[n])
    .filter(Boolean);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return labels.join(" ");
}

/**
 * Stream LangGraph agent output and encode as SSE compatible with handleStreamingResponse.
 * Emits data: { content } for assistant text, data: { type: "status", message } for Cursor-style stage updates.
 */
export async function* streamAgentToSSE(
  graph: AgentGraph,
  initialState: AgentState
): AsyncGenerator<string, void, unknown> {
  const stream = await graph.stream(initialState as unknown as Parameters<AgentGraph["stream"]>[0], {
    streamMode: ["messages", "updates"],
    configurable: { thread_id: crypto.randomUUID() },
  });

  for await (const payload of stream) {
    const isTuple = Array.isArray(payload) && payload.length >= 2;
    const mode = isTuple ? (payload as [string, unknown])[0] : undefined;
    const chunk = isTuple ? (payload as [unknown, unknown])[1] : payload;

    if (mode === "updates" && chunk && typeof chunk === "object") {
      const updates = chunk as Record<string, { messages?: unknown[] }>;
      if (updates.agent?.messages?.length) {
        const last = updates.agent.messages[updates.agent.messages.length - 1] as AIMessage;
        const toolCalls = last?.tool_calls;
        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          const names = [...new Set(toolCalls.map((tc) => tc.name as string))];
          const msg = emitStatus(names);
          if (msg) {
            yield `data: ${JSON.stringify({ type: "status", message: msg })}\n\n`;
          }
        } else if (typeof last?.content === "string" && last.content.length > 0) {
          yield `data: ${JSON.stringify({ type: "status", message: "Generating response..." })}\n\n`;
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
  yield `data: [DONE]\n\n`;
}
