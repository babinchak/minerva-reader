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
import {
  insertAssistantPlaceholder,
  finalizeAssistantMessage,
  isStopRequested,
  type PersistedToolCall,
} from "@/lib/chat/persistence";

const MARKDOWN_SYSTEM_PROMPT =
  "You are a helpful reading assistant. Respond using GitHub-flavored Markdown (GFM).\n" +
  "- Use headings, bullet lists, and tables when helpful.\n" +
  "- Use short section headings (e.g. ###) to break up the answer.\n" +
  "- Bold the key terms and the most meaningful phrases.\n" +
  "- Use fenced code blocks with a language tag for code.\n" +
  "- Do NOT wrap the entire response in a single code block.\n" +
  "- Avoid raw HTML; prefer Markdown.\n" +
  "- You assist with books of any genre or era, including older works that use dated terminology or reflect outdated views (e.g. historical texts, classic literature, older science). Explain what the author meant in their own context.\n" +
  "- Do NOT add modern disclaimers, content warnings, ethical caveats, \"important caution\" notes, or commentary about how a term is \"viewed today\" unless the user explicitly asks for modern context. Answer the user's question directly.\n" +
  "\nYou have access to tools:\n" +
  "- **vector_search**: semantic search — returns full text chunks. Your primary tool for any substantive question about the book's content.\n" +
  "- **text_search**: exact keyword/phrase lookup. Use ONLY when the user wants to locate a specific word, name, or literal phrase in the book.\n" +
  "- **web_search**: search the web for information outside the book.\n" +
  "\n## When to call tools\n" +
  "**Default to vector_search** for any substantive question about what the book says, means, argues, describes, or implies — even if some related text is already in the conversation. Search results are far more reliable than your guess at what's relevant.\n" +
  "Skip search ONLY in these cases:\n" +
  "- The user is asking about your previous reply or the conversation itself (\"rephrase that\", \"what did you mean by X\").\n" +
  "- The question is fully answerable from text inside a `<current_page_context>` block in the user's message — that text is already on the user's screen, so don't re-fetch it.\n" +
  "- The request is purely meta/conversational (\"shorter please\", \"in bullet points\").\n" +
  "\n## Choosing vector_search vs text_search\n" +
  "**Prefer vector_search by default.** text_search is for literal lookups only — finding an exact word, name, or phrase as it appears in the text. Do NOT use text_search for thematic, conceptual, paraphrased, or interpretive questions, even when the user's question contains specific terms.\n" +
  "Examples:\n" +
  "- \"What does the author say about doubt?\" → vector_search\n" +
  "- \"How does the narrator describe Ahab?\" → vector_search\n" +
  "- \"What's the role of fate in this story?\" → vector_search\n" +
  "- \"Find every place the word 'duty' appears\" → text_search\n" +
  "- \"Where does it say 'the white whale'?\" → text_search\n" +
  "- \"Does the author ever use the word 'sublime'?\" → text_search\n" +
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
  "\n**CRITICAL: section_id values are internal UUIDs. They MUST appear ONLY inside a `(ref:<section_id>)` link — never as plain text, never in parentheses, never as a \"source:\", \"section:\", or \"id:\" label, never anywhere else in the response. The user must never see a raw UUID.**\n" +
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
  "- You assist with books of any genre or era, including older works that use dated terminology or reflect outdated views (e.g. historical texts, classic literature, older science). Explain what the author meant in their own context.\n" +
  "- Do NOT add modern disclaimers, content warnings, ethical caveats, \"important caution\" notes, or commentary about how a term is \"viewed today\" unless the user explicitly asks for modern context. Answer the user's question directly.\n" +
  "\nYou have access to tools that search across ALL books in the user's {scope}:\n" +
  "{list_books_hint}" +
  "- **vector_search**: semantic search — returns full text chunks (~1200 chars). Your primary tool for any substantive question. Supports `max_per_book` to cap results from any single book (use 2-3 when exploring broadly across books).\n" +
  "- **text_search**: exact keyword/phrase lookup across books. Use ONLY for literal word/name/phrase lookups. Also supports `max_per_book`.\n" +
  "- **web_search**: search the web for information outside the books.\n" +
  "\n## When to call tools\n" +
  "**Default to vector_search** for any substantive question about what the books say, mean, argue, describe, or imply. Search results are far more reliable than your guess at what's relevant.\n" +
  "Skip search ONLY in these cases:\n" +
  "- The user is asking about your previous reply or the conversation itself (\"rephrase that\", \"what did you mean by X\").\n" +
  "- The question is fully answerable from text inside a `<current_page_context>` block in the user's message — that text is already on the user's screen, so don't re-fetch it.\n" +
  "- The request is purely meta/conversational (\"shorter please\", \"in bullet points\").\n" +
  "\n## Choosing vector_search vs text_search\n" +
  "**Prefer vector_search by default.** text_search is for literal lookups only — finding an exact word, name, or phrase as it appears in the text. Do NOT use text_search for thematic, conceptual, paraphrased, or interpretive questions, even when the user's question contains specific terms.\n" +
  "Examples:\n" +
  "- \"What do these books say about doubt?\" → vector_search\n" +
  "- \"How do the Stoics describe virtue?\" → vector_search\n" +
  "- \"What's the role of fate in tragedy?\" → vector_search\n" +
  "- \"Find every place the word 'duty' appears\" → text_search\n" +
  "- \"Which book mentions Napoleon by name?\" → text_search\n" +
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
  "\n**CRITICAL: section_id values are internal UUIDs. They MUST appear ONLY inside a `(ref:<section_id>)` link — never as plain text, never in parentheses, never as a \"source:\", \"section:\", or \"id:\" label, never anywhere else in the response. The user must never see a raw UUID.**\n" +
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

    const body = (await req.json()) as { messages?: unknown; bookId?: string; bookIds?: string[]; chatId?: string; scopeLabel?: string; messageIndex?: number; isPrivate?: boolean };
    const { messages: rawMessages, bookId, bookIds, chatId, scopeLabel, messageIndex, isPrivate } = body;
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
      const usageCheck = await canMakeRequest(user.id, AGENTIC_ESTIMATED_DOLLARS, user.email);
      if (!usageCheck.allowed) {
        return NextResponse.json(
          {
            error: "Usage limit reached",
            usageDenied: true,
            reason: usageCheck.reason,
            resetAt: usageCheck.resetAt,
            tier: usageCheck.tier,
            extraUsageBalance: usageCheck.extraUsageBalance,
            onDemandLimitType: usageCheck.onDemandLimitType,
            onDemandLimitDollars: usageCheck.onDemandLimitDollars,
            extraUsageSpent: usageCheck.extraUsageSpent,
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
      includeListBooks: !bookListBlock,
    });
    const listBooksHint = isLibraryMode && !bookListBlock
      ? "- list_books: see all available books (title, author, book_id). Call this first if you need to know what's in the {scope}.\n"
      : "";
    const systemPrompt = (isLibraryMode ? LIBRARY_SYSTEM_PROMPT.replace("{list_books_hint}", listBooksHint).replace(/\{scope\}/g, scope) : MARKDOWN_SYSTEM_PROMPT) + bookListBlock;
    const initialState = {
      messages: [new SystemMessage(systemPrompt), ...langchainMessages],
    };

    // Persist to chat_messages for logged-in, non-private chats. The placeholder
    // row gives Stop a target to mark and gives the finalize step an id to UPDATE.
    // Use the service client for server-side persistence so we don't depend on
    // having UPDATE/INSERT RLS policies for chat_messages. Ownership was already
    // validated above.
    const shouldPersist = Boolean(user && chatId && !isPrivate);
    let assistantMessageId: string | null = null;
    if (shouldPersist && chatId && typeof messageIndex === "number") {
      assistantMessageId = await insertAssistantPlaceholder(serviceSupabase, {
        chatId,
        messageIndex,
        chatMode: "agentic",
        model,
      });
    }

    // Internal abort — used for explicit stop. Tab-close is intentionally NOT
    // wired here so generation runs to completion and persists for later viewing.
    // Anonymous / private chats have no stop endpoint to hit, so we fall back to
    // tying internal abort to req.signal in that case.
    const internalAbort = new AbortController();
    if (!assistantMessageId) {
      if (req.signal.aborted) internalAbort.abort();
      else req.signal.addEventListener("abort", () => internalAbort.abort());
    }

    const encoder = new TextEncoder();
    let capturedInputTokens: number | null = null;
    let capturedOutputTokens: number | null = null;
    let capturedCachedInputTokens: number | null = null;
    let fullContent = "";
    const accumulatedToolCalls: PersistedToolCall[] = [];
    let usageRecorded = false;
    let finalized = false;
    const POLL_INTERVAL_MS = 1500;
    let lastPollAt = 0;

    const recordIfNeeded = async () => {
      if (usageRecorded) return null;
      usageRecorded = true;
      if (capturedInputTokens == null || capturedOutputTokens == null) return null;
      const costDollars = costDollarsFromTokens(
        model,
        capturedInputTokens,
        capturedOutputTokens,
        true,
        capturedCachedInputTokens ?? 0
      );
      try {
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
        return { result, costDollars };
      } catch (err) {
        console.error("recordUsage failed:", err);
        return { result: { success: false, costDollars }, costDollars };
      }
    };

    const finalizeIfNeeded = async (finalCostDollars: number | null) => {
      if (finalized) return;
      finalized = true;
      if (!assistantMessageId) return;
      try {
        await finalizeAssistantMessage(
          supabase,
          assistantMessageId,
          fullContent,
          {
            inputTokens: capturedInputTokens,
            outputTokens: capturedOutputTokens,
            costDollars: finalCostDollars,
            model,
            chatMode: "agentic",
          },
          accumulatedToolCalls
        );
      } catch (err) {
        console.error("finalizeAssistantMessage failed:", err);
      }
    };

    const readable = new ReadableStream({
      async start(controller) {
        // Tell the client its row id so Stop knows what to target.
        const safeEnqueue = (bytes: Uint8Array) => {
          try { controller.enqueue(bytes); } catch { /* client gone — keep generating for DB persistence */ }
        };
        if (assistantMessageId) {
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: "assistant_message_id", id: assistantMessageId })}\n\n`));
        }

        const maybePollStop = async () => {
          if (!assistantMessageId) return;
          const now = Date.now();
          if (now - lastPollAt < POLL_INTERVAL_MS) return;
          lastPollAt = now;
          if (await isStopRequested(supabase, assistantMessageId)) {
            internalAbort.abort();
          }
        };

        try {
          let lastChunk = "";
          for await (const chunk of streamAgentToSSE(graph, initialState, { signal: internalAbort.signal })) {
            if (chunk.includes("[DONE]")) {
              const recorded = await recordIfNeeded();
              const finalCost = recorded?.result.success ? recorded.result.costDollars : recorded?.costDollars ?? null;
              await finalizeIfNeeded(finalCost);
              safeEnqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "usage",
                    inputTokens: capturedInputTokens,
                    outputTokens: capturedOutputTokens,
                    costDollars: finalCost ?? estimatedDollars,
                    model,
                    chatMode: "agentic",
                  })}\n\n`
                )
              );
              lastChunk = chunk;
            } else {
              // Parse SSE events to (a) capture usage_tokens (internal, not forwarded),
              // (b) accumulate fullContent + tool calls for server-side persistence.
              const match = chunk.match(/^data:\s*(\{.*\})\s*$/m);
              if (match) {
                try {
                  const parsed = JSON.parse(match[1]) as {
                    type?: string;
                    inputTokens?: number;
                    outputTokens?: number;
                    cachedInputTokens?: number;
                    content?: string;
                    toolName?: string;
                    args?: Record<string, unknown>;
                    id?: string;
                    toolCallId?: string;
                    results?: unknown;
                  };
                  if (parsed.type === "usage_tokens") {
                    capturedInputTokens = parsed.inputTokens ?? null;
                    capturedOutputTokens = parsed.outputTokens ?? null;
                    capturedCachedInputTokens = parsed.cachedInputTokens ?? null;
                    continue; // skip forwarding internal event
                  }
                  if (parsed.type === "tool_call" && parsed.toolName) {
                    accumulatedToolCalls.push({
                      toolName: parsed.toolName,
                      args: parsed.args,
                      id: parsed.id,
                    });
                  } else if (parsed.type === "tool_result_summary" && parsed.toolCallId) {
                    const tc = accumulatedToolCalls.find((t) => t.id === parsed.toolCallId);
                    if (tc) tc.resultSummary = parsed.results;
                  } else if (parsed.type === "status") {
                    // Status events fire at agent-step boundaries — good poll hook.
                    await maybePollStop();
                  } else if (typeof parsed.content === "string") {
                    fullContent += parsed.content;
                  }
                } catch {
                  /* ignore parse errors */
                }
              }
              safeEnqueue(encoder.encode(chunk));
            }
          }
          if (lastChunk) safeEnqueue(encoder.encode(lastChunk));
          try { controller.close(); } catch { /* already closed */ }
        } catch (err) {
          // Internal abort (explicit stop) lands here. Treat like clean end —
          // bill for consumed tokens and persist the partial message.
          if (internalAbort.signal.aborted) {
            const recorded = await recordIfNeeded();
            const finalCost = recorded?.result.success ? recorded.result.costDollars : recorded?.costDollars ?? null;
            await finalizeIfNeeded(finalCost);
            try { controller.close(); } catch { /* already closed */ }
            return;
          }
          console.error("Agentic stream error:", err);
          await finalizeIfNeeded(null);
          try {
            safeEnqueue(
              encoder.encode(
                `data: ${JSON.stringify({ content: "\n\nSorry, an error occurred while generating the response." })}\n\n`
              )
            );
            safeEnqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch { /* already closed */ }
        }
      },
      // NOTE: no cancel() handler — tab close must NOT abort upstream so the
      // generation runs to completion and persists for the user to see later.
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
