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
  "\nYou have access to tools: vector_search (semantic search — returns full text chunks), text_search (keyword search in the book), and web_search (search the web). " +
  "Use them when they would improve your answer. You can also answer directly from the context provided if it's sufficient.\n" +
  "\n## Multi-search strategy\n" +
  "Most questions need only ONE well-crafted vector_search call. A broad thematic question like \"What role does doubt play in the pursuit of knowledge?\" should be a single search, not split into multiple similar searches.\n" +
  "Only use multiple parallel vector_search calls when the question has genuinely DISTINCT sides that need separate queries — i.e. a clear X vs Y, for vs against, or A compared to B structure where each side would match different passages. " +
  "Example: \"Is morality universal or culturally relative?\" has two distinct sides, so call three searches in parallel:\n" +
  "  1. vector_search(\"morality is universal absolute objective natural law categorical imperative\")\n" +
  "  2. vector_search(\"morality is culturally relative custom convention varies by society\")\n" +
  "  3. vector_search(\"whether morality is universal or relative debate\")\n" +
  "Do NOT split into multiple searches when the question is about a single theme explored across books (e.g. \"role of doubt\", \"views on justice\", \"how do philosophers approach death\"). One search handles these well.\n" +
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
  "- ONLY create navigable references when you have a real section_id returned by a tool (vector_search, text_search, or get_passages). Never use the ref: format for text from the conversation or user message — use a regular blockquote instead.\n" +
  "- Prefer short, complete quotes (1-2 sentences). Only use … to omit an irrelevant clause within a longer quote that is essential to the argument. Avoid ellipsis when a shorter complete quote would work.\n" +
  "- Quotes render as standalone blocks in the UI, so NEVER embed them inline within a sentence. Introduce the quote with a complete sentence (ending in a colon or period), then place the quote reference on its own new line. Wrong: 'the Stoics hold that [\"all things…\"](ref:abc) and …' — Right: 'The Stoics hold that all things take place by destiny:\\n\\n[\"all things take place by destiny\"](ref:abc)'\n" +
  "- Don't repeat the book title before a quote — the quote card already displays it. You can refer to the author by name to introduce the quote naturally (e.g. 'Arnold argues:' instead of 'From Edward Vernon Arnold, *Roman Stoicism*:').";

const LIBRARY_SYSTEM_PROMPT =
  "You are a helpful reading assistant with access to the user's book {scope}. Respond using GitHub-flavored Markdown (GFM).\n" +
  "- Use headings, bullet lists, and tables when helpful.\n" +
  "- Use short section headings (e.g. ###) to break up the answer.\n" +
  "- Bold the key terms and the most meaningful phrases.\n" +
  "- Use fenced code blocks with a language tag for code.\n" +
  "- Do NOT wrap the entire response in a single code block.\n" +
  "- Avoid raw HTML; prefer Markdown.\n" +
  "- Do NOT begin your response with a \"Short answer\" or summary line. Dive straight into the substance.\n" +
  "\nYou have access to tools that search across ALL books in the user's {scope}:\n" +
  "{list_books_hint}" +
  "- vector_search: semantic search — returns full text chunks (~1200 chars). " +
  "Supports `max_per_book` to cap results from any single book (use 2-3 when exploring broadly across books).\n" +
  "- text_search: keyword search across all books. Also supports `max_per_book`.\n" +
  "- web_search: search the web\n" +
  "Prefer vector_search for most questions; use text_search only when the user needs exact keyword or phrase matches (e.g. a specific term, name, or quote).\n" +
  "\n## Searching across books\n" +
  "Choose limit and max_per_book based on the question type:\n" +
  "- **Specific book question**: `limit: 10`, omit max_per_book for deeper results from that book.\n" +
  "- **Broad cross-library question** (single search): `limit: 20, max_per_book: 2` to get diverse results from ~10 different books.\n" +
  "- **Comparative question** (multiple searches): `limit: 8, max_per_book: 2` per search call, so total context stays reasonable across all calls.\n" +
  "\n## Multi-search strategy\n" +
  "Most questions need only ONE well-crafted vector_search call. A broad thematic question like \"What role does doubt play in the pursuit of knowledge?\" should be a single search, not split into multiple similar searches.\n" +
  "Only use multiple parallel vector_search calls when the question has genuinely DISTINCT sides that need separate queries — i.e. a clear X vs Y, for vs against, or A compared to B structure where each side would match different passages. " +
  "Example: \"Is morality universal or culturally relative?\" has two distinct sides, so call three searches in parallel:\n" +
  "  1. vector_search(\"morality is universal absolute objective natural law categorical imperative\")\n" +
  "  2. vector_search(\"morality is culturally relative custom convention varies by society\")\n" +
  "  3. vector_search(\"whether morality is universal or relative debate\")\n" +
  "Do NOT split into multiple searches when the question is about a single theme explored across books (e.g. \"role of doubt\", \"views on justice\", \"how do philosophers approach death\"). One search handles these well.\n" +
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
  "- ONLY create navigable references when you have a real section_id returned by a tool (vector_search, text_search, or get_passages). Never use the ref: format for text from the conversation or user message — use a regular blockquote instead.\n" +
  "- Prefer short, complete quotes (1-2 sentences). Only use … to omit an irrelevant clause within a longer quote that is essential to the argument. Avoid ellipsis when a shorter complete quote would work.\n" +
  "- Quotes render as standalone blocks in the UI, so NEVER embed them inline within a sentence. Introduce the quote with a complete sentence (ending in a colon or period), then place the quote reference on its own new line. Wrong: 'the Stoics hold that [\"all things…\"](ref:abc) and …' — Right: 'The Stoics hold that all things take place by destiny:\\n\\n[\"all things take place by destiny\"](ref:abc)'\n" +
  "- Don't repeat the book title before a quote — the quote card already displays it. You can refer to the author by name to introduce the quote naturally (e.g. 'Arnold argues:' instead of 'From Edward Vernon Arnold, *Roman Stoicism*:').";

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

    const body = (await req.json()) as { messages?: unknown; bookId?: string; bookIds?: string[]; chatId?: string; scopeLabel?: string };
    const { messages: rawMessages, bookId, bookIds, chatId, scopeLabel } = body;
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
      const canAfford = await canMakeRequest(user.id, AGENTIC_ESTIMATED_DOLLARS, user.email);
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

    // Build book list for library mode system prompt (up to 200 books)
    const scope = scopeLabel || "library";
    let bookListBlock = "";
    if (isLibraryMode && validatedBookIds && validatedBookIds.length <= 200) {
      const { data: booksMeta } = await serviceSupabase
        .from("books")
        .select("id, title, author")
        .in("id", validatedBookIds);
      if (booksMeta && booksMeta.length > 0) {
        const lines = booksMeta.map((b: { id: string; title: string | null; author: string | null }) => {
          const label = b.title && b.author ? `${b.title} by ${b.author}` : (b.title || "Unknown title");
          return `- [${b.id}] ${label}`;
        });
        bookListBlock = `\n\n## Books in this ${scope} (${booksMeta.length})\n${lines.join("\n")}`;
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
    const listBooksHint = isLibraryMode && !bookListBlock
      ? "- list_books: see all available books (title, author, book_id). Call this first if you need to know what's in the {scope}.\n"
      : "";
    const systemPrompt = (isLibraryMode ? LIBRARY_SYSTEM_PROMPT.replace("{list_books_hint}", listBooksHint).replace(/\{scope\}/g, scope) : MARKDOWN_SYSTEM_PROMPT) + bookListBlock;
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
