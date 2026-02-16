import { createClient } from "@/lib/supabase/server";
import { createAgentGraph } from "@/lib/agent/graph";
import { streamAgentToSSE } from "@/lib/agent/stream";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { NextRequest, NextResponse } from "next/server";

const MARKDOWN_SYSTEM_PROMPT =
  "You are a helpful reading assistant. Respond using GitHub-flavored Markdown (GFM).\n" +
  "- Use headings, bullet lists, and tables when helpful.\n" +
  "- Use short section headings (e.g. ###) to break up the answer.\n" +
  "- Bold the key terms and the most meaningful phrases.\n" +
  "- Use fenced code blocks with a language tag for code.\n" +
  "- Do NOT wrap the entire response in a single code block.\n" +
  "- Avoid raw HTML; prefer Markdown.\n" +
  "\nYou have access to tools: vector_search (semantic search in the book), text_search (keyword search in the book), and web_search (search the web). " +
  "Use them when they would improve your answer. You can also answer directly from the context provided if it's sufficient.";

type IncomingMessage = { role: "system" | "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key is not configured" },
        { status: 500 }
      );
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { messages?: unknown; bookId?: string };
    const { messages: rawMessages, bookId } = body;

    if (!rawMessages || !Array.isArray(rawMessages)) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      );
    }

    if (bookId) {
      const { data: userBook } = await supabase
        .from("user_books")
        .select("id")
        .eq("user_id", user.id)
        .eq("book_id", bookId)
        .single();
      if (!userBook) {
        return NextResponse.json({ error: "Access denied to this book" }, { status: 403 });
      }
    }

    const messages = rawMessages as IncomingMessage[];
    const langchainMessages = messages.map((m) => {
      if (m.role === "user") {
        return new HumanMessage(m.content ?? "");
      }
      if (m.role === "assistant") {
        return new AIMessage(m.content ?? "");
      }
      return new HumanMessage(m.content ?? "");
    });

    const graph = createAgentGraph(bookId ?? null, user.id);
    const initialState = {
      messages: [new SystemMessage(MARKDOWN_SYSTEM_PROMPT), ...langchainMessages],
    };

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamAgentToSSE(graph, initialState)) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        } catch (err) {
          console.error("Agentic stream error:", err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ content: "\n\nSorry, an error occurred while generating the response." })}\n\n`
            )
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Agentic chat error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "An error occurred" },
      { status: 500 }
    );
  }
}
