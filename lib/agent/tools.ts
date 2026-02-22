import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { vectorSearch, getPassageContent, SNIPPET_LENGTH } from "@/lib/vector-search";
import { textSearch } from "@/lib/text-search";
import { webSearch } from "@/lib/tools/web-search";

export interface AgentToolsOptions {
  vectorsReady?: boolean;
}

export function createAgentTools(
  bookId: string | null,
  userId: string,
  options?: AgentToolsOptions
) {
  const vectorsReady = options?.vectorsReady ?? false;

  const vectorSearchTool = tool(
    async ({ query, limit }: { query: string; limit?: number }) => {
      if (!bookId) {
        return JSON.stringify({ results: [], error: "No book context. Vector search requires an open book." });
      }
      const { results, error } = await vectorSearch(bookId, query, limit ?? 10, {
        snippetLength: SNIPPET_LENGTH,
      });
      if (error) {
        return JSON.stringify({ results: [], error });
      }
      // Fallback to text search when vector bucket is empty (e.g. vectors_processed_at is null)
      if (results.length === 0) {
        const firstWord = query.trim().split(/\s+/).find((w) => w.length > 2) ?? query.trim().split(/\s+/)[0] ?? query;
        if (firstWord) {
          const { results: textResults } = await textSearch(bookId, userId, firstWord, limit ?? 10, {
            matchContextChars: 200,
          });
          if (textResults.length > 0) {
            return JSON.stringify({
              results: textResults.map((r) => ({
                snippet: r.content_text,
                start_position: r.start_position,
                end_position: r.end_position,
                section_id: r.section_id,
                similarity: null,
              })),
              _fallback: "keyword",
              _hint: "Use get_passage_content with section_ids to fetch full text when you need to quote or cite.",
            });
          }
        }
      }
      return JSON.stringify({
        results: results.map((r) => ({
          snippet: r.content_text,
          start_position: r.start_position,
          end_position: r.end_position,
          section_id: r.section_id,
          similarity: r.similarity,
        })),
        _hint: "Use get_passage_content with section_ids to fetch full text when you need to quote or cite.",
      });
    },
    {
      name: "vector_search",
      description:
        "Semantic search within the current book. Use when you need to find passages by meaning or topic. " +
        "Craft a query that describes what you're looking for (e.g. 'discussion of free will', 'character introduction'). " +
        "Returns short snippets with section_id and positions. Call get_passage_content with section_ids when you need full text to quote or cite. Only works when a book is open.",
      schema: z.object({
        query: z.string().describe("The semantic query to search for in the book."),
        limit: z.number().optional().describe("Max results to return (default 10, max 50)."),
      }),
    }
  );

  const getPassageContentTool = tool(
    async ({ section_ids }: { section_ids: string[] }) => {
      if (!bookId) {
        return JSON.stringify({ passages: [], error: "No book context. get_passage_content requires an open book." });
      }
      if (!section_ids?.length || !Array.isArray(section_ids)) {
        return JSON.stringify({ passages: [], error: "section_ids array is required (from vector_search results)." });
      }
      const { passages, error } = await getPassageContent(bookId, section_ids, userId);
      if (error) {
        return JSON.stringify({ passages: [], error });
      }
      return JSON.stringify({
        passages: passages.map((p) => ({
          section_id: p.section_id,
          content_text: p.content_text,
          start_position: p.start_position,
          end_position: p.end_position,
        })),
      });
    },
    {
      name: "get_passage_content",
      description:
        "Fetch full text for specific passages. Use after vector_search when you need the complete passage to quote, cite, or include in a transcript. " +
        "Pass the section_ids from the vector_search results you want to expand.",
      schema: z.object({
        section_ids: z
          .array(z.string())
          .describe("Array of section_id values from vector_search results (e.g. ['uuid1', 'uuid2'])."),
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
          section_id: r.section_id,
        })),
        _hint: vectorsReady
          ? "Use get_passage_content with section_ids to fetch full text when you need to quote or cite."
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
      ? [vectorSearchTool, getPassageContentTool, textSearchTool, webSearchTool]
      : bookId
        ? [getPassageContentTool, textSearchTool, webSearchTool]
        : [textSearchTool, webSearchTool];
  return tools as ReturnType<typeof tool>[];
}
