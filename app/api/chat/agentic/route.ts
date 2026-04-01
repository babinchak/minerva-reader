import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createAgentGraph } from "@/lib/agent/graph";
import { streamAgentToSSE } from "@/lib/agent/stream";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { NextRequest, NextResponse } from "next/server";
import {
  getTier,
  getModelForTier,
  canMakeRequest,
  AGENTIC_ESTIMATED_DOLLARS,
  isFreeBetaMode,
} from "@/lib/credits";
import { recordUsage, costDollarsFromTokens } from "@/lib/usage";

const MARKDOWN_SYSTEM_PROMPT =
  "You are a helpful reading assistant. Respond using GitHub-flavored Markdown (GFM).\n" +
  "- Use headings, bullet lists, and tables when helpful.\n" +
  "- Use short section headings (e.g. ###) to break up the answer.\n" +
  "- Bold the key terms and the most meaningful phrases.\n" +
  "- Use fenced code blocks with a language tag for code.\n" +
  "- Do NOT wrap the entire response in a single code block.\n" +
  "- Avoid raw HTML; prefer Markdown.\n" +
  "\nYou have access to tools: vector_search (semantic search — returns full text chunks with section_index), get_passages (fetch merged text for chunk index ranges), text_search (keyword search in the book), and web_search (search the web). " +
  "Use them when they would improve your answer. vector_search returns full chunks (~1200 chars) which may be sufficient to quote from directly. " +
  "If text is cut off at a chunk boundary or you need more context, call get_passages with index ranges (e.g. if chunk 5 ends mid-sentence, request {start: 4, end: 6}). " +
  "You can also answer directly from the context provided if it's sufficient.\n" +
  "\n## Navigable References\n" +
  "When you directly quote text from the book, make the quote a navigable reference so the reader can jump to it.\n" +
  "Tool results include `section_id` (from vector_search) or `chunks` array with `section_id` per chunk (from get_passages) — use these to link quotes back to their source.\n" +
  "Format: `[\"quoted text\"](ref:<section_id>)`\n" +
  "Example: `[\"Call me Ishmael.\"](ref:a1b2c3d4-e5f6-7890-abcd-ef1234567890)`\n" +
  "\nRules:\n" +
  "- ALWAYS use the `[\"quoted text\"](ref:<section_id>)` link format for quoting from the book. Never use bare blockquotes (> ...) for book quotes.\n" +
  "- The quoted text inside the link MUST be copied verbatim from the passage content_text. Do not paraphrase or alter it.\n" +
  "- Use the section_id exactly as it appears in the tool result.\n" +
  "- If a passage has no section_id, just use a regular blockquote instead.\n" +
  "- For long quotes, use … to skip less important sections in the middle. Keep the opening and closing verbatim.";

const LIBRARY_SYSTEM_PROMPT =
  "You are a helpful reading assistant with access to the user's book library. Respond using GitHub-flavored Markdown (GFM).\n" +
  "- Use headings, bullet lists, and tables when helpful.\n" +
  "- Use short section headings (e.g. ###) to break up the answer.\n" +
  "- Bold the key terms and the most meaningful phrases.\n" +
  "- Use fenced code blocks with a language tag for code.\n" +
  "- Do NOT wrap the entire response in a single code block.\n" +
  "- Avoid raw HTML; prefer Markdown.\n" +
  "\nYou have access to tools that search across ALL books in the user's library:\n" +
  "- vector_search: semantic search — returns full text chunks (~1200 chars) with section_index\n" +
  "- get_passages: fetch merged text for chunk index ranges (include book_id)\n" +
  "- text_search: keyword search across all books\n" +
  "- web_search: search the web\n" +
  "vector_search returns full chunks which may be sufficient to quote from directly. " +
  "If text is cut off at a chunk boundary or you need more context, call get_passages with index ranges and book_id.\n" +
  "\n## Important: Attribute results to their source book\n" +
  "Tool results include `book` (title and author) and `book_id` for each result. " +
  "ALWAYS mention which book a quote or finding comes from. " +
  "When presenting results from multiple books, organize by book or clearly label each finding.\n" +
  "\n## Navigable References\n" +
  "When you directly quote text from a book, make the quote a navigable reference so the reader can jump to it.\n" +
  "Tool results include `section_id` (from vector_search) or `chunks` array with `section_id` per chunk (from get_passages) — use these to link quotes back to their source.\n" +
  "Format: `[\"quoted text\"](ref:<section_id>)`\n" +
  "Example: `[\"Call me Ishmael.\"](ref:a1b2c3d4-e5f6-7890-abcd-ef1234567890)`\n" +
  "\nRules:\n" +
  "- ALWAYS use the `[\"quoted text\"](ref:<section_id>)` link format for quoting from books. Never use bare blockquotes (> ...) for book quotes.\n" +
  "- The quoted text inside the link MUST be copied verbatim from the passage content_text. Do not paraphrase or alter it.\n" +
  "- Use the section_id exactly as it appears in the tool result.\n" +
  "- If a passage has no section_id, just use a regular blockquote instead.\n" +
  "- For long quotes, use … to skip less important sections in the middle. Keep the opening and closing verbatim.\n" +
  "- Always state which book the quote is from before or after the reference.";

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
    const serviceSupabase = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    const body = (await req.json()) as { messages?: unknown; bookId?: string; bookIds?: string[]; chatId?: string };
    const { messages: rawMessages, bookId, bookIds, chatId } = body;
    const isLibraryMode = Array.isArray(bookIds) && bookIds.length > 0;

    if (!rawMessages || !Array.isArray(rawMessages)) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      );
    }

    // Library mode requires authentication (no anonymous multi-book search)
    if (isLibraryMode && !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Anonymous: allow for curated books, or when FREE_BETA_MODE
    if (!user) {
      if (isFreeBetaMode()) {
        // Free beta: allow anonymous Deep mode (with or without book)
      } else {
        if (!bookId) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { data: book } = await serviceSupabase
          .from("books")
          .select("is_curated, vectors_processed_at")
          .eq("id", bookId)
          .single();
        if (!book?.is_curated) {
          return NextResponse.json({ error: "Access denied to this book" }, { status: 403 });
        }
      }
    }

    const tier = await getTier(user?.id ?? null);

    // Logged-in: check usage budget
    if (user) {
      const canAfford = await canMakeRequest(user.id, AGENTIC_ESTIMATED_DOLLARS);
      if (!canAfford) {
        return NextResponse.json(
          {
            error: "Usage limit reached",
            message: "You've used your included usage. Upgrade to Pro or wait for your allowance to reset.",
          },
          { status: 402 }
        );
      }
    }

    let vectorsReady = false;
    let validatedBookIds: string[] | undefined;

    if (isLibraryMode && user) {
      // Library mode: validate user has access to all requested books and check if any have vectors
      const { data: userBookRows } = await supabase
        .from("user_books")
        .select("book_id")
        .eq("user_id", user.id);
      const userBookIdSet = new Set((userBookRows ?? []).map((r) => r.book_id));

      // Also allow curated books
      const { data: curatedBooks } = await serviceSupabase
        .from("books")
        .select("id")
        .eq("is_curated", true);
      const curatedIdSet = new Set((curatedBooks ?? []).map((b) => b.id));

      validatedBookIds = bookIds!.filter((id) => userBookIdSet.has(id) || curatedIdSet.has(id));
      if (validatedBookIds.length === 0) {
        return NextResponse.json({ error: "No accessible books in the provided list" }, { status: 403 });
      }

      // Check if at least one book has vectors ready
      const { data: booksWithVectors } = await serviceSupabase
        .from("books")
        .select("id")
        .in("id", validatedBookIds)
        .not("vectors_processed_at", "is", null)
        .limit(1);
      vectorsReady = (booksWithVectors?.length ?? 0) > 0;
    } else if (bookId) {
      if (user) {
        const { data: userBook } = await supabase
          .from("user_books")
          .select("id")
          .eq("user_id", user.id)
          .eq("book_id", bookId)
          .single();
        const { data: curatedBook } = await serviceSupabase
          .from("books")
          .select("is_curated, vectors_processed_at")
          .eq("id", bookId)
          .single();
        if (!userBook && !curatedBook?.is_curated) {
          return NextResponse.json({ error: "Access denied to this book" }, { status: 403 });
        }
        vectorsReady = Boolean(curatedBook?.vectors_processed_at);
      } else {
        const { data: book } = await serviceSupabase
          .from("books")
          .select("vectors_processed_at")
          .eq("id", bookId)
          .single();
        vectorsReady = Boolean(book?.vectors_processed_at);
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

    const model = getModelForTier(tier);
    const estimatedDollars = AGENTIC_ESTIMATED_DOLLARS;
    const graph = createAgentGraph(bookId ?? null, user?.id ?? null, {
      vectorsReady,
      model,
      bookIds: validatedBookIds,
    });
    const systemPrompt = isLibraryMode ? LIBRARY_SYSTEM_PROMPT : MARKDOWN_SYSTEM_PROMPT;
    const initialState = {
      messages: [new SystemMessage(systemPrompt), ...langchainMessages],
    };

    const encoder = new TextEncoder();
    let capturedInputTokens: number | null = null;
    let capturedOutputTokens: number | null = null;
    let capturedCachedInputTokens: number | null = null;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          let lastChunk = "";
          for await (const chunk of streamAgentToSSE(graph, initialState)) {
            if (chunk.includes("[DONE]")) {
              const costDollars =
                capturedInputTokens != null && capturedOutputTokens != null
                  ? costDollarsFromTokens(model, capturedInputTokens, capturedOutputTokens, true, capturedCachedInputTokens ?? 0)
                  : estimatedDollars;
              const result = await recordUsage({
                      userId: user?.id ?? null,
                      costDollars,
                      usageType: "chat_agentic",
                      model,
                      inputTokens: capturedInputTokens ?? undefined,
                      outputTokens: capturedOutputTokens ?? undefined,
                      cachedInputTokens: capturedCachedInputTokens ?? undefined,
                      referenceId: chatId,
                    });
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "usage",
                    inputTokens: capturedInputTokens,
                    outputTokens: capturedOutputTokens,
                    costDollars: result.success ? result.costDollars : costDollars,
                    model,
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
                  const parsed = JSON.parse(match[1]) as { type?: string; inputTokens?: number; outputTokens?: number; cachedInputTokens?: number };
                  if (parsed.type === "usage_tokens") {
                    capturedInputTokens = parsed.inputTokens ?? null;
                    capturedOutputTokens = parsed.outputTokens ?? null;
                    capturedCachedInputTokens = parsed.cachedInputTokens ?? null;
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
