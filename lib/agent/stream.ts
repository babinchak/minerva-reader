import type { BaseMessage } from "@langchain/core/messages";
import type { AIMessage } from "@langchain/core/messages";
import type { AgentState } from "./graph";
import { resolveQuotePage, resolveQuotePosition, resolveQuoteReadingOrder, type SectionData } from "@/lib/resolve-quote-page";

type AgentGraph = ReturnType<typeof import("./graph").createAgentGraph>;

type ToolCallChunk = { name?: string; args?: Record<string, unknown>; id?: string };

function getToolCallPayload(tc: ToolCallChunk): { type: "tool_call"; toolName: string; args: Record<string, unknown>; id?: string } | null {
  const name = typeof tc.name === "string" ? tc.name : undefined;
  if (!name) return null;
  const args = tc.args && typeof tc.args === "object" ? (tc.args as Record<string, unknown>) : {};
  return { type: "tool_call", toolName: name, args, id: typeof tc.id === "string" ? tc.id : undefined };
}

// ---------------------------------------------------------------------------
// RefEnricher — intercepts ](ref:SECTION_ID) in the streaming AI content and
// rewrites to ](ref:SECTION_ID?p=42) (PDF) or ](ref:SECTION_ID?ro=5) (EPUB),
// with &bid=BOOK_ID in library mode. Page numbers are resolved server-side
// and baked into the stored message content so history loads need no fetching.
// ---------------------------------------------------------------------------

interface SectionCacheEntry extends SectionData {
  bookId?: string;
}

class RefEnricher {
  private cache = new Map<string, SectionCacheEntry>();
  private buffer = "";
  /**
   * Accumulated emitted content for backward quote extraction.
   * Reset after each ref is processed so it doesn't grow unbounded.
   */
  private emitted = "";

  addSection(id: string, data: SectionCacheEntry) {
    this.cache.set(id, data);
  }

  /** Push a content token. Returns zero or more enriched chunks to emit. */
  push(content: string): string[] {
    this.buffer += content;
    return this.drain();
  }

  /** Flush any remaining buffered content (call at end of stream). */
  flush(): string | null {
    if (!this.buffer) return null;
    const out = this.buffer;
    this.buffer = "";
    return out;
  }

  private drain(): string[] {
    const results: string[] = [];
    const REF_PATTERN = /\]\(ref:([^)]+)\)/;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const match = this.buffer.match(REF_PATTERN);
      if (match && match.index != null) {
        const before = this.buffer.slice(0, match.index);
        const after = this.buffer.slice(match.index + match[0].length);
        const sectionId = match[1]!;

        // Accumulate content before the ref for quote extraction
        this.emitted += before;
        const enriched = this.enrichRef(sectionId);

        if (before) results.push(before);
        results.push(enriched);
        // Reset emitted after ref is processed — next quote starts fresh
        this.emitted = "";
        this.buffer = after;
        continue;
      }

      // Check for potential partial ref at end — hold it back
      const holdFrom = this.findHoldPoint();
      if (holdFrom >= 0 && holdFrom < this.buffer.length) {
        const safe = this.buffer.slice(0, holdFrom);
        if (safe) {
          results.push(safe);
          this.emitted += safe;
        }
        this.buffer = this.buffer.slice(holdFrom);
      } else if (this.buffer) {
        results.push(this.buffer);
        this.emitted += this.buffer;
        this.buffer = "";
      }
      break;
    }

    return results;
  }

  /** Find the index in `buffer` where a potential partial `](ref:...)` begins. */
  private findHoldPoint(): number {
    const prefix = "](ref:";
    // Complete prefix present but no closing paren yet
    const fullIdx = this.buffer.lastIndexOf(prefix);
    if (fullIdx >= 0 && !this.buffer.slice(fullIdx + prefix.length).includes(")")) {
      return fullIdx;
    }
    // Partial prefix at end of buffer (], ](, ](r, ](re, ](ref, ](ref:)
    for (let len = Math.min(prefix.length - 1, this.buffer.length); len >= 1; len--) {
      if (this.buffer.endsWith(prefix.slice(0, len))) {
        return this.buffer.length - len;
      }
    }
    return -1;
  }

  /** Enrich a ref with resolved page/reading-order params. */
  private enrichRef(sectionId: string): string {
    const section = this.cache.get(sectionId);
    if (!section) return `](ref:${sectionId})`;

    const quotedText = this.extractQuotedText();
    const isPage = /^\d+$/.test(section.startPosition);
    const params: string[] = [];

    if (isPage) {
      const page = resolveQuotePage(section, quotedText);
      if (page != null) params.push(`p=${page}`);
    } else {
      // EPUB: extract reading order index from "readingOrderIndex/path"
      const startRo = parseInt(section.startPosition.split("/")[0], 10);
      if (!Number.isNaN(startRo)) {
        // Use xhtml_breaks to resolve the correct reading order index
        // when the section spans multiple XHTML files
        const ro = resolveQuoteReadingOrder(section, startRo, quotedText);
        params.push(`ro=${ro}`);
      }
      // EPUB: resolve Readium position number from page_breaks
      const pos = resolveQuotePosition(section, quotedText);
      if (pos != null) params.push(`pos=${pos}`);
    }

    if (section.bookId) params.push(`bid=${section.bookId}`);

    const qs = params.length > 0 ? `?${params.join("&")}` : "";
    return `](ref:${sectionId}${qs})`;
  }

  /**
   * Extract the quoted text from the emitted content preceding the ref.
   * Searches backward for `["` (the markdown link opening) with no window limit.
   */
  private extractQuotedText(): string | undefined {
    // emitted contains everything since the last ref (or start of stream).
    // The AI format is ["quoted text"](ref:ID). The `]` has been consumed by
    // the ref pattern, so emitted ends with the quoted text + closing quote.
    // Search backward for the `[` + quote-char opening.
    for (let i = this.emitted.length - 1; i >= 0; i--) {
      if (
        this.emitted[i] === "[" &&
        i + 1 < this.emitted.length &&
        /[""\u201C\u201D]/.test(this.emitted[i + 1]!)
      ) {
        const raw = this.emitted.slice(i + 2); // skip `[` and opening quote
        return raw.replace(/[""\u201C\u201D]+$/, "").trim() || undefined;
      }
    }
    return undefined;
  }
}

/**
 * Stream LangGraph agent output and encode as SSE compatible with handleStreamingResponse.
 * Emits data: { content } for assistant text, data: { type: "status", message } for Cursor-style stage updates.
 * Emits data: { type: "usage_tokens", inputTokens, outputTokens, cachedInputTokens } before [DONE] when available from AIMessage.usage_metadata.
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
  let totalCachedInputTokens = 0;
  const refEnricher = new RefEnricher();

  for await (const payload of stream) {
    // LangGraph yields [namespace?, mode, chunk] - 3 elements with subgraphs, 2 without
    const isTuple = Array.isArray(payload) && payload.length >= 2;
    const mode = isTuple
      ? (payload.length >= 3 ? (payload as unknown as [unknown, string, unknown])[1] : (payload as unknown as [string, unknown])[0])
      : undefined;
    const chunk = isTuple
      ? (payload.length >= 3 ? (payload as unknown as [unknown, unknown, unknown])[2] : (payload as unknown as [unknown, unknown])[1])
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
        const um = last?.usage_metadata as { input_tokens?: number; output_tokens?: number; input_token_details?: { cache_read?: number } } | undefined;
        const rm = last?.response_metadata as { tokenUsage?: { promptTokens?: number; completionTokens?: number }; usage?: { prompt_tokens_details?: { cached_tokens?: number } } } | undefined;
        if (um) {
          totalInputTokens += um.input_tokens ?? 0;
          totalOutputTokens += um.output_tokens ?? 0;
          totalCachedInputTokens += um.input_token_details?.cache_read ?? 0;
        } else if (rm?.tokenUsage) {
          totalInputTokens += rm.tokenUsage.promptTokens ?? 0;
          totalOutputTokens += rm.tokenUsage.completionTokens ?? 0;
          totalCachedInputTokens += rm.usage?.prompt_tokens_details?.cached_tokens ?? 0;
        }
      }
      if (updates.tools?.messages?.length) {
        yield `data: ${JSON.stringify({ type: "status", message: "Processing results..." })}\n\n`;
        // Extract section data from tool results so the client can map section_id → page
        for (const toolMsg of updates.tools.messages) {
          const content = typeof (toolMsg as { content?: unknown }).content === "string"
            ? (toolMsg as { content: string }).content
            : null;
          if (!content) continue;
          try {
            const parsed = JSON.parse(content) as {
              results?: Array<{ section_id?: string; start_position?: string; page_breaks?: number[] | null; xhtml_breaks?: number[] | null; content_text?: string; book_id?: string; book?: string; book_type?: string }>;
              passages?: Array<{
                start_position?: string; page_breaks?: number[] | null; xhtml_breaks?: number[] | null; content_text?: string;
                book_id?: string; book?: string; book_type?: string;
                chunks?: Array<{ section_id: string; section_index: number; char_offset: number }>;
              }>;
            };
            // Handle vector_search results (each item has its own section_id)
            if (parsed.results) {
              for (const item of parsed.results) {
                if (item.section_id && item.start_position) {
                  refEnricher.addSection(item.section_id, {
                    startPosition: item.start_position,
                    pageBreaks: item.page_breaks ?? null,
                    xhtmlBreaks: item.xhtml_breaks ?? null,
                    contentText: item.content_text ?? null,
                    bookId: item.book_id,
                  });
                  const sectionEvent: Record<string, unknown> = {
                    type: "section_map",
                    sectionId: item.section_id,
                    startPosition: item.start_position,
                    pageBreaks: item.page_breaks ?? null,
                    contentText: item.content_text ?? null,
                  };
                  if (item.book_id) sectionEvent.bookId = item.book_id;
                  if (item.book) sectionEvent.bookLabel = item.book;
                  if (item.book_type) sectionEvent.bookType = item.book_type;
                  yield `data: ${JSON.stringify(sectionEvent)}\n\n`;
                }
              }
            }
            // Handle get_passages results (merged passages with chunks array)
            if (parsed.passages) {
              for (const passage of parsed.passages) {
                if (!passage.chunks?.length || !passage.start_position) continue;
                for (const chunk of passage.chunks) {
                  refEnricher.addSection(chunk.section_id, {
                    startPosition: passage.start_position,
                    pageBreaks: passage.page_breaks ?? null,
                    xhtmlBreaks: passage.xhtml_breaks ?? null,
                    contentText: passage.content_text ?? null,
                    bookId: passage.book_id,
                  });
                  const sectionEvent: Record<string, unknown> = {
                    type: "section_map",
                    sectionId: chunk.section_id,
                    startPosition: passage.start_position,
                    pageBreaks: passage.page_breaks ?? null,
                    contentText: passage.content_text ?? null,
                  };
                  if (passage.book_id) sectionEvent.bookId = passage.book_id;
                  if (passage.book) sectionEvent.bookLabel = passage.book;
                  if (passage.book_type) sectionEvent.bookType = passage.book_type;
                  yield `data: ${JSON.stringify(sectionEvent)}\n\n`;
                }
              }
            }
          } catch {
            // Not JSON or unexpected shape — skip
          }
        }
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
          for (const enriched of refEnricher.push(content)) {
            yield `data: ${JSON.stringify({ content: enriched })}\n\n`;
          }
        }
      }
    }
  }

  // Flush any remaining buffered content from the ref enricher
  const remaining = refEnricher.flush();
  if (remaining) {
    yield `data: ${JSON.stringify({ content: remaining })}\n\n`;
  }

  if (totalInputTokens > 0 || totalOutputTokens > 0) {
    yield `data: ${JSON.stringify({ type: "usage_tokens", inputTokens: totalInputTokens, outputTokens: totalOutputTokens, cachedInputTokens: totalCachedInputTokens })}\n\n`;
  }
  yield `data: [DONE]\n\n`;
}
