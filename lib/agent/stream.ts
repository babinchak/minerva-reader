import type { BaseMessage } from "@langchain/core/messages";
import type { AgentState } from "./graph";

type AgentGraph = ReturnType<typeof import("./graph").createAgentGraph>;

/**
 * Stream LangGraph agent output and encode as SSE compatible with handleStreamingResponse.
 * Emits data: { content } chunks for assistant text content.
 */
export async function* streamAgentToSSE(
  graph: AgentGraph,
  initialState: AgentState
): AsyncGenerator<string, void, unknown> {
  const stream = await graph.stream(initialState as unknown as Parameters<AgentGraph["stream"]>[0], {
    streamMode: "messages",
    configurable: { thread_id: crypto.randomUUID() },
  });

  for await (const chunk of stream) {
    const msgOrTuple = (chunk as { messages?: unknown })?.messages ?? chunk;
    const messages = Array.isArray(msgOrTuple) ? msgOrTuple : [msgOrTuple];
    for (const m of messages) {
      const msg: BaseMessage | [BaseMessage, Record<string, unknown>] = m;
      const baseMsg = Array.isArray(msg) ? msg[0] : msg;
      const content = typeof baseMsg?.content === "string" ? baseMsg.content : "";
      if (content) {
        yield `data: ${JSON.stringify({ content })}\n\n`;
      }
    }
  }
  yield `data: [DONE]\n\n`;
}
