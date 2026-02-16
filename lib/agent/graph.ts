import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage } from "@langchain/core/messages";
import { StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { createAgentTools } from "./tools";

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
}

export function createAgentGraph(
  bookId: string | null,
  userId: string,
  options?: AgentGraphOptions
) {
  const vectorsReady = options?.vectorsReady ?? false;
  const tools = createAgentTools(bookId, userId, { vectorsReady }) as StructuredToolInterface[];
  const toolNode = new ToolNode<AgentState>(tools);

  const model = new ChatOpenAI({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  }).bindTools(tools);

  async function callModel(state: AgentState) {
    const response = await model.invoke(state.messages);
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
