import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { vectorSearch } from "@/lib/vector-search";
import { textSearch } from "@/lib/text-search";
import { webSearch } from "@/lib/tools/web-search";

export function createAgentTools(bookId: string | null, userId: string) {
  const vectorSearchTool = tool(
    async ({ query, limit }: { query: string; limit?: number }) => {
      if (!bookId) {
        return JSON.stringify({ results: [], error: "No book context. Vector search requires an open book." });
      }
      const { results, error } = await vectorSearch(bookId, query, limit ?? 10);
      if (error) {
        return JSON.stringify({ results: [], error });
      }
      // Fallback to text search when vector bucket is empty (e.g. vectors_processed_at is null)
      if (results.length === 0) {
        const firstWord = query.trim().split(/\s+/).find((w) => w.length > 2) ?? query.trim().split(/\s+/)[0] ?? query;
        if (firstWord) {
          const { results: textResults } = await textSearch(bookId, userId, firstWord, limit ?? 10);
          if (textResults.length > 0) {
            return JSON.stringify({
              results: textResults.map((r) => ({
                content_text: r.content_text,
                start_position: r.start_position,
                end_position: r.end_position,
                similarity: null,
              })),
              _fallback: "keyword",
            });
          }
        }
      }
      return JSON.stringify({
        results: results.map((r) => ({
          content_text: r.content_text,
          start_position: r.start_position,
          end_position: r.end_position,
          similarity: r.similarity,
        })),
      });
    },
    {
      name: "vector_search",
      description:
        "Semantic search within the current book. Use when you need to find passages by meaning or topic. " +
        "Craft a query that describes what you're looking for (e.g. 'discussion of free will', 'character introduction'). " +
        "Returns relevant text sections with positions. Only works when a book is open.",
      schema: z.object({
        query: z.string().describe("The semantic query to search for in the book."),
        limit: z.number().optional().describe("Max results to return (default 10, max 50)."),
      }),
    }
  );

  const textSearchTool = tool(
    async ({ query, limit }: { query: string; limit?: number }) => {
      if (!bookId) {
        return JSON.stringify({ results: [], error: "No book context. Text search requires an open book." });
      }
      const { results, error } = await textSearch(bookId, userId, query, limit ?? 10);
      if (error) {
        return JSON.stringify({ results: [], error });
      }
      return JSON.stringify({
        results: results.map((r) => ({
          content_text: r.content_text,
          start_position: r.start_position,
          end_position: r.end_position,
        })),
      });
    },
    {
      name: "text_search",
      description:
        "Exact/keyword text search within the current book. Use when you need to find specific words or phrases " +
        "(e.g. a name, a quote, a term). Returns matching sections. Only works when a book is open.",
      schema: z.object({
        query: z.string().describe("The text or phrase to search for in the book."),
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

  return [vectorSearchTool, textSearchTool, webSearchTool];
}
