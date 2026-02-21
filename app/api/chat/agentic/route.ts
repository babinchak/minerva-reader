import { createClient } from "@/lib/supabase/server";
import { createAgentGraph } from "@/lib/agent/graph";
import { streamAgentToSSE } from "@/lib/agent/stream";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { NextRequest, NextResponse } from "next/server";
import {
  getTier,
  getModelForTier,
  canMakeRequest,
  countAgenticRequestsToday,
  AGENTIC_ESTIMATED_CENTS,
} from "@/lib/credits";
import { recordUsage, costCentsFromTokens } from "@/lib/usage";

const MARKDOWN_SYSTEM_PROMPT =
  "You are a helpful reading assistant. Respond using GitHub-flavored Markdown (GFM).\n" +
  "- Use headings, bullet lists, and tables when helpful.\n" +
  "- Use short section headings (e.g. ###) to break up the answer.\n" +
  "- Bold the key terms and the most meaningful phrases.\n" +
  "- Use fenced code blocks with a language tag for code.\n" +
  "- Do NOT wrap the entire response in a single code block.\n" +
  "- Avoid raw HTML; prefer Markdown.\n" +
  "\nYou have access to tools: vector_search (semantic search in the book), get_passage_content (fetch full text for passages by section_id), text_search (keyword search in the book), and web_search (search the web). " +
  "Use them when they would improve your answer. Call get_passage_content with section_ids when you need full text to quote or cite. You can also answer directly from the context provided if it's sufficient.";

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

    const tier = await getTier(user.id);

    // Free tier: 5 deep mode questions per day
    if (tier === "free") {
      const agenticToday = await countAgenticRequestsToday(user.id);
      if (agenticToday >= 5) {
        return NextResponse.json(
          {
            error: "Deep mode limit reached",
            message:
              "Free tier allows 5 deep mode questions per day. Upgrade to Pro for unlimited.",
          },
          { status: 403 }
        );
      }
    }

    // Included mode: allow. On-demand mode: check can afford ~$1 for Deep mode.
    const canAfford = await canMakeRequest(user.id, AGENTIC_ESTIMATED_CENTS);
    if (!canAfford) {
      return NextResponse.json(
        {
          error: "Insufficient credits",
          message: "You've run out of credits. Upgrade or add more to continue.",
        },
        { status: 402 }
      );
    }

    const body = (await req.json()) as { messages?: unknown; bookId?: string; chatId?: string };
    const { messages: rawMessages, bookId, chatId } = body;

    if (!rawMessages || !Array.isArray(rawMessages)) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      );
    }

    let vectorsReady = false;
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
      const { data: book } = await supabase
        .from("books")
        .select("vectors_processed_at")
        .eq("id", bookId)
        .single();
      vectorsReady = Boolean(book?.vectors_processed_at);
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

    const model = getModelForTier(tier);
    const estimatedCents = AGENTIC_ESTIMATED_CENTS;
    const graph = createAgentGraph(bookId ?? null, user.id, {
      vectorsReady,
      model,
    });
    const initialState = {
      messages: [new SystemMessage(MARKDOWN_SYSTEM_PROMPT), ...langchainMessages],
    };

    const encoder = new TextEncoder();
    let capturedInputTokens: number | null = null;
    let capturedOutputTokens: number | null = null;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          let lastChunk = "";
          for await (const chunk of streamAgentToSSE(graph, initialState)) {
            if (chunk.includes("[DONE]")) {
              const costCents =
                capturedInputTokens != null && capturedOutputTokens != null
                  ? costCentsFromTokens(model, capturedInputTokens, capturedOutputTokens, true)
                  : estimatedCents;
              const result = await recordUsage({
                userId: user.id,
                costCents,
                usageType: "chat",
                model,
                inputTokens: capturedInputTokens ?? undefined,
                outputTokens: capturedOutputTokens ?? undefined,
                referenceId: chatId,
              });
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "usage",
                    inputTokens: capturedInputTokens,
                    outputTokens: capturedOutputTokens,
                    costCents: result.success ? result.costCents : costCents,
                    model,
                    included: result.success ? result.included : true,
                    chatMode: "agentic",
                  })}\n\n`
                )
              );
              lastChunk = chunk;
            } else {
              // Capture usage_tokens from stream (internal event, do not forward)
              const match = chunk.match(/^data:\s*(\{.*\})\s*$/m);
              if (match) {
                try {
                  const parsed = JSON.parse(match[1]) as { type?: string; inputTokens?: number; outputTokens?: number };
                  if (parsed.type === "usage_tokens") {
                    capturedInputTokens = parsed.inputTokens ?? null;
                    capturedOutputTokens = parsed.outputTokens ?? null;
                    continue; // skip forwarding internal event
                  }
                } catch {
                  /* ignore parse errors */
                }
              }
              controller.enqueue(encoder.encode(chunk));
            }
          }
          if (lastChunk) controller.enqueue(encoder.encode(lastChunk));
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
