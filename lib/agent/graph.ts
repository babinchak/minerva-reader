import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { createAgentTools, createLibraryAgentTools } from "./tools";

export interface AgentState {
  messages: BaseMessage[];
}

const graphState = {
  messages: {
    reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
  },
};

function shouldContinue(state: AgentState): "tools" | "__end__" {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  return lastMessage.tool_calls?.length ? "tools" : "__end__";
}

export interface AgentGraphOptions {
  vectorsReady?: boolean;
  model?: string;
  /** When set, uses library-wide multi-book tools instead of single-book tools. */
  bookIds?: string[];
}

export function createAgentGraph(
  bookId: string | null,
  userId: string | null,
  options?: AgentGraphOptions
) {
  const vectorsReady = options?.vectorsReady ?? false;
  const modelId = options?.model ?? process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
  const tools = options?.bookIds?.length
    ? createLibraryAgentTools(options.bookIds, userId, { vectorsReady }) as StructuredToolInterface[]
    : createAgentTools(bookId, userId, { vectorsReady }) as StructuredToolInterface[];
  const toolNode = new ToolNode<AgentState>(tools);

  const model = new ChatOpenAI({
    model: modelId,
  }).bindTools(tools);

  /** Fields to strip from tool result JSON before sending to the LLM.
   *  These are only needed by the UI (stream.ts extracts them from the
   *  original ToolMessage before this runs). */
  const LLM_STRIP_FIELDS = new Set([
    "section_index",
    "start_position",
    "end_position",
    "page_breaks",
    "xhtml_breaks",
    "similarity",
  ]);

  function stripFieldsFromResult(obj: unknown): unknown {
    if (Array.isArray(obj)) return obj.map(stripFieldsFromResult);
    if (obj && typeof obj === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (LLM_STRIP_FIELDS.has(k)) continue;
        out[k] = k === "chunks"
          ? (v as Array<Record<string, unknown>>).map((chunk) => ({ section_id: chunk.section_id, char_offset: chunk.char_offset }))
          : stripFieldsFromResult(v);
      }
      return out;
    }
    return obj;
  }

  /** Rewrite ToolMessage content to remove UI-only fields before the LLM sees them. */
  function sanitizeMessages(messages: BaseMessage[]): BaseMessage[] {
    return messages.map((msg) => {
      if (!(msg instanceof ToolMessage) || typeof msg.content !== "string") return msg;
      try {
        const parsed = JSON.parse(msg.content);
        const cleaned = stripFieldsFromResult(parsed);
        return new ToolMessage({
          content: JSON.stringify(cleaned),
          tool_call_id: msg.tool_call_id,
          name: msg.name,
        });
      } catch {
        return msg;
      }
    });
  }

  async function callModel(state: AgentState) {
    const response = await model.invoke(sanitizeMessages(state.messages));
    return { messages: [response] };
  }

  const app = new StateGraph<AgentState>({ channels: graphState })
    .addNode("agent", callModel)
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent")
    .compile();

  return app;
}
