import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { vectorSearch, getPassagesByRange, vectorSearchMulti, getPassagesByRangeMulti } from "@/lib/vector-search";
import { textSearch, textSearchMulti } from "@/lib/text-search";
import { createServiceClient } from "@/lib/supabase/server";
import { webSearch } from "@/lib/tools/web-search";

export interface AgentToolsOptions {
  vectorsReady?: boolean;
}

export function createAgentTools(
  bookId: string | null,
  userId: string | null,
  options?: AgentToolsOptions
) {
  const vectorsReady = options?.vectorsReady ?? false;

  const vectorSearchTool = tool(
    async ({ query, limit }: { query: string; limit?: number }) => {
      if (!bookId) {
        return JSON.stringify({ results: [], error: "No book context. Vector search requires an open book." });
      }
      const { results, error } = await vectorSearch(bookId, query, limit ?? 10);
      if (error) {
        return JSON.stringify({ results: [], error });
      }
      // Fallback to text search when no embeddings exist (e.g. vectors_processed_at is null)
      if (results.length === 0) {
        const firstWord = query.trim().split(/\s+/).find((w) => w.length > 2) ?? query.trim().split(/\s+/)[0] ?? query;
        if (firstWord) {
          const { results: textResults } = await textSearch(bookId, userId, firstWord, limit ?? 10, {
            matchContextChars: 200,
          });
          if (textResults.length > 0) {
            return JSON.stringify({
              results: textResults.map((r) => ({
                content_text: r.content_text,
                start_position: r.start_position,
                end_position: r.end_position,
                page_breaks: r.page_breaks,
                section_id: r.section_id,
                similarity: null,
              })),
              _fallback: "keyword",
              _hint: "Use get_passages with chunk index ranges to fetch adjacent context if needed.",
            });
          }
        }
      }
      return JSON.stringify({
        results: results.map((r) => ({
          content_text: r.content_text,
          section_index: r.section_index,
          start_position: r.start_position,
          end_position: r.end_position,
          page_breaks: r.page_breaks,
          section_id: r.section_id,
          similarity: r.similarity,
        })),
        _hint: "Each result is a full chunk (~1200 chars). Use get_passages with index ranges to fetch surrounding context if text is cut off at boundaries or you need more context. For example, if chunk 5 ends mid-sentence, request range {start: 4, end: 6}.",
      });
    },
    {
      name: "vector_search",
      description:
        "Semantic search within the current book. Returns full text chunks (~1200 chars each) with section_index. " +
        "Each chunk may be sufficient on its own for quoting. If text is cut off at chunk boundaries or you need more context, " +
        "use get_passages with index ranges (e.g. if you got chunk 5, request start:4 end:6 to see surrounding text).",
      schema: z.object({
        query: z.string().describe("The semantic query to search for in the book."),
        limit: z.number().optional().describe("Max results to return (default 10, max 50)."),
      }),
    }
  );

  const getPassagesTool = tool(
    async ({ ranges }: { ranges: Array<{ start: number; end: number }> }) => {
      if (!bookId) {
        return JSON.stringify({ passages: [], error: "No book context." });
      }
      if (!ranges?.length || !Array.isArray(ranges)) {
        return JSON.stringify({ passages: [], error: "ranges array is required." });
      }
      const { passages, error } = await getPassagesByRange(bookId, ranges, userId);
      if (error) {
        return JSON.stringify({ passages: [], error });
      }
      return JSON.stringify({
        passages: passages.map((p) => ({
          content_text: p.content_text,
          start_position: p.start_position,
          end_position: p.end_position,
          page_breaks: p.page_breaks,
          chunks: p.chunks,
        })),
      });
    },
    {
      name: "get_passages",
      description:
        "Fetch merged text for chunk index ranges. Use after vector_search to get surrounding context. " +
        "Each range {start, end} returns all chunks from start to end merged into one continuous passage. " +
        "The response includes a chunks array with section_id and char_offset for each chunk so you can reference the correct section when quoting. " +
        "Max 10 chunks per range.",
      schema: z.object({
        ranges: z
          .array(
            z.object({
              start: z.number().describe("Start section_index (inclusive)."),
              end: z.number().describe("End section_index (inclusive)."),
            })
          )
          .describe("Array of index ranges to fetch (e.g. [{start: 4, end: 6}, {start: 12, end: 14}])."),
      }),
    }
  );

  const textSearchTool = tool(
    async ({ query, limit }: { query: string; limit?: number }) => {
      if (!bookId) {
        return JSON.stringify({ results: [], error: "No book context. Text search requires an open book." });
      }
      const { results, error } = await textSearch(bookId, userId, query, limit ?? 10, {
        matchContextChars: 200,
      });
      if (error) {
        return JSON.stringify({ results: [], error });
      }
      return JSON.stringify({
        results: results.map((r) => ({
          snippet: r.content_text,
          start_position: r.start_position,
          end_position: r.end_position,
          page_breaks: r.page_breaks,
          section_id: r.section_id,
        })),
        _hint: vectorsReady
          ? "Use get_passages with chunk index ranges to fetch surrounding context if needed."
          : undefined,
      });
    },
    {
      name: "text_search",
      description:
        "Exact/keyword text search within the current book. Use when you need to find specific words or short phrases. " +
        "Use 1–3 words or a short key phrase per term. For multiple alternatives (OR search), separate with | (e.g. 'scarlet|velvet', 'Coke|coca-cola|Pepsi'). " +
        "Returns matching sections. Only works when a book is open.",
      schema: z.object({
        query: z.string().describe("Search term(s). Use | to search multiple alternatives (OR): e.g. 'scarlet|velvet' or 'Coke|coca-cola'."),
        limit: z.number().optional().describe("Max results to return (default 10, max 50)."),
      }),
    }
  );

  const webSearchTool = tool(
    async ({ query, max_results }: { query: string; max_results?: number }) => {
      const { results, error } = await webSearch(query, { maxResults: max_results ?? 5 });
      if (error) {
        return JSON.stringify({ results: [], error });
      }
      return JSON.stringify({
        results: results.map((r) => ({ title: r.title, url: r.url, content: r.content })),
      });
    },
    {
      name: "web_search",
      description:
        "Search the web for external information. Use when the user's question may benefit from current events, " +
        "definitions, or information outside the book (e.g. author biography, historical context, related concepts).",
      schema: z.object({
        query: z.string().describe("The search query for the web."),
        max_results: z.number().optional().describe("Max results to return (default 5, max 20)."),
      }),
    }
  );

  const tools =
    vectorsReady && bookId
      ? [vectorSearchTool, getPassagesTool, textSearchTool, webSearchTool]
      : bookId
        ? [getPassagesTool, textSearchTool, webSearchTool]
        : [textSearchTool, webSearchTool];
  return tools as ReturnType<typeof tool>[];
}

export interface LibraryAgentToolsOptions {
  vectorsReady?: boolean;
}

export function createLibraryAgentTools(
  bookIds: string[],
  userId: string | null,
  options?: LibraryAgentToolsOptions
) {
  const vectorsReady = options?.vectorsReady ?? false;

  const formatBookLabel = (title: string | null, author: string | null) => {
    if (title && author) return `${title} by ${author}`;
    return title || "Unknown book";
  };

  // Validate and filter book_ids from LLM against the allowed set
  const allowedBookIdSet = new Set(bookIds);
  const resolveTargetBooks = (filterIds?: string[]) => {
    if (!filterIds || filterIds.length === 0) return bookIds;
    const valid = filterIds.filter((id) => allowedBookIdSet.has(id));
    return valid.length > 0 ? valid : bookIds;
  };

  const vectorSearchTool = tool(
    async ({ query, limit, max_per_book, book_ids }: { query: string; limit?: number; max_per_book?: number; book_ids?: string[] }) => {
      const targetBooks = resolveTargetBooks(book_ids);
      const { results, error } = await vectorSearchMulti(targetBooks, query, limit ?? 10, {
        maxPerBook: max_per_book,
      });
      if (error) {
        return JSON.stringify({ results: [], error });
      }
      if (results.length === 0) {
        // Fallback to text search
        const firstWord = query.trim().split(/\s+/).find((w) => w.length > 2) ?? query.trim().split(/\s+/)[0] ?? query;
        if (firstWord) {
          const { results: textResults } = await textSearchMulti(targetBooks, userId, firstWord, limit ?? 10, {
            matchContextChars: 200,
            maxPerBook: max_per_book,
          });
          if (textResults.length > 0) {
            return JSON.stringify({
              results: textResults.map((r) => ({
                content_text: r.content_text,
                start_position: r.start_position,
                end_position: r.end_position,
                page_breaks: r.page_breaks,
                section_id: r.section_id,
                similarity: null,
                book_id: r.book_id,
                book: formatBookLabel(r.book_title, r.book_author),
                book_type: r.book_type,
              })),
              _fallback: "keyword",
              _hint: "Use get_passages with chunk index ranges and book_id to fetch adjacent context if needed.",
            });
          }
        }
      }
      return JSON.stringify({
        results: results.map((r) => ({
          content_text: r.content_text,
          section_index: r.section_index,
          start_position: r.start_position,
          end_position: r.end_position,
          page_breaks: r.page_breaks,
          section_id: r.section_id,
          similarity: r.similarity,
          book_id: r.book_id,
          book: formatBookLabel(r.book_title, r.book_author),
          book_type: r.book_type,
        })),
        _hint: "Each result is a full chunk (~1200 chars). Use get_passages with index ranges and book_id to fetch surrounding context if needed.",
      });
    },
    {
      name: "vector_search",
      description:
        "Semantic search across books. Returns full text chunks (~1200 chars each) with section_index. " +
        "Use max_per_book to ensure diverse results across books (recommended: 2-3 when exploring broadly). " +
        "Use book_ids to search only specific books. " +
        "If text is cut off at chunk boundaries or you need more context, " +
        "use get_passages with index ranges and book_id.",
      schema: z.object({
        query: z.string().describe("The semantic query to search for across the library."),
        limit: z.number().optional().describe("Max total results to return (default 10, max 50)."),
        max_per_book: z.number().optional().describe("Max results from any single book (default: no limit). Use 2-3 for broad cross-book exploration."),
        book_ids: z.array(z.string()).optional().describe("Only search these specific book IDs (default: all books in collection)."),
      }),
    }
  );

  const getPassagesTool = tool(
    async ({ ranges }: { ranges: Array<{ book_id: string; start: number; end: number }> }) => {
      if (!ranges?.length || !Array.isArray(ranges)) {
        return JSON.stringify({ passages: [], error: "ranges array is required." });
      }
      const { passages, error } = await getPassagesByRangeMulti(ranges, userId, bookIds);
      if (error) {
        return JSON.stringify({ passages: [], error });
      }
      return JSON.stringify({
        passages: passages.map((p) => ({
          content_text: p.content_text,
          start_position: p.start_position,
          end_position: p.end_position,
          page_breaks: p.page_breaks,
          chunks: p.chunks,
          book_id: p.book_id,
          book: formatBookLabel(p.book_title, p.book_author),
          book_type: p.book_type,
        })),
      });
    },
    {
      name: "get_passages",
      description:
        "Fetch merged text for chunk index ranges across books. Use after vector_search to get surrounding context. " +
        "Each range {book_id, start, end} returns all chunks merged into one continuous passage. " +
        "The response includes a chunks array with section_id and char_offset for referencing. " +
        "Max 10 chunks per range.",
      schema: z.object({
        ranges: z
          .array(
            z.object({
              book_id: z.string().describe("Book ID from vector_search results."),
              start: z.number().describe("Start section_index (inclusive)."),
              end: z.number().describe("End section_index (inclusive)."),
            })
          )
          .describe("Array of index ranges with book_id to fetch."),
      }),
    }
  );

  const textSearchTool = tool(
    async ({ query, limit, max_per_book, book_ids }: { query: string; limit?: number; max_per_book?: number; book_ids?: string[] }) => {
      const targetBooks = resolveTargetBooks(book_ids);
      const { results, error } = await textSearchMulti(targetBooks, userId, query, limit ?? 10, {
        matchContextChars: 200,
        maxPerBook: max_per_book,
      });
      if (error) {
        return JSON.stringify({ results: [], error });
      }
      return JSON.stringify({
        results: results.map((r) => ({
          snippet: r.content_text,
          start_position: r.start_position,
          end_position: r.end_position,
          page_breaks: r.page_breaks,
          section_id: r.section_id,
          book_id: r.book_id,
          book: formatBookLabel(r.book_title, r.book_author),
          book_type: r.book_type,
        })),
        _hint: vectorsReady
          ? "Use get_passages with chunk index ranges and book_id to fetch surrounding context if needed."
          : undefined,
      });
    },
    {
      name: "text_search",
      description:
        "Exact/keyword text search across books. Use when you need to find specific words or short phrases. " +
        "Use 1-3 words or a short key phrase per term. For multiple alternatives (OR search), separate with | (e.g. 'scarlet|velvet'). " +
        "Use max_per_book to ensure diverse results across books. Use book_ids to search only specific books. " +
        "Returns matching sections with book information.",
      schema: z.object({
        query: z.string().describe("Search term(s). Use | to search multiple alternatives (OR): e.g. 'scarlet|velvet'."),
        limit: z.number().optional().describe("Max total results to return (default 10, max 50)."),
        max_per_book: z.number().optional().describe("Max results from any single book (default: no limit). Use 2-3 for broad cross-book exploration."),
        book_ids: z.array(z.string()).optional().describe("Only search these specific book IDs (default: all books in collection)."),
      }),
    }
  );

  const webSearchTool = tool(
    async ({ query, max_results }: { query: string; max_results?: number }) => {
      const { results, error } = await webSearch(query, { maxResults: max_results ?? 5 });
      if (error) {
        return JSON.stringify({ results: [], error });
      }
      return JSON.stringify({
        results: results.map((r) => ({ title: r.title, url: r.url, content: r.content })),
      });
    },
    {
      name: "web_search",
      description:
        "Search the web for external information. Use when the user's question may benefit from current events, " +
        "definitions, or information outside the books (e.g. author biography, historical context, related concepts).",
      schema: z.object({
        query: z.string().describe("The search query for the web."),
        max_results: z.number().optional().describe("Max results to return (default 5, max 20)."),
      }),
    }
  );

  const listBooksTool = tool(
    async () => {
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("books")
        .select("id, title, author, book_type")
        .in("id", bookIds);
      if (error) {
        return JSON.stringify({ books: [], error: error.message });
      }
      return JSON.stringify({
        books: (data ?? []).map((b: any) => ({
          book_id: b.id,
          title: b.title,
          author: b.author,
          book_type: b.book_type,
        })),
        total: data?.length ?? 0,
      });
    },
    {
      name: "list_books",
      description:
        "List all books available in this collection/library. Returns title, author, and book_id for each book. " +
        "Useful for understanding what books are available before searching, or when the user asks what's in their collection.",
      schema: z.object({}),
    }
  );

  const tools = vectorsReady
    ? [vectorSearchTool, getPassagesTool, textSearchTool, listBooksTool, webSearchTool]
    : [getPassagesTool, textSearchTool, listBooksTool, webSearchTool];
  return tools as ReturnType<typeof tool>[];
}
