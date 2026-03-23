import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-large";

/** Max chars per result when returning snippets (reduces token cost). */
export const SNIPPET_LENGTH = 250;

export interface VectorSearchResult {
  content_text: string;
  start_position: string | null;
  end_position: string | null;
  similarity: number | null;
  section_id?: string;
}

export interface VectorSearchOptions {
  /** When set, truncate content_text to this length. Omit for full content. */
  snippetLength?: number;
}

export async function vectorSearch(
  bookId: string,
  query: string,
  limit = 10,
  options?: VectorSearchOptions
): Promise<{ results: VectorSearchResult[]; error?: string }> {
  const topK = Math.min(Math.max(1, limit), 50);

  if (!process.env.OPENAI_API_KEY) {
    return { results: [], error: "OpenAI API key is not configured" };
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: query.trim(),
      dimensions: 1536,
    });
    const queryVector = embeddingResponse.data[0]?.embedding;
    if (!queryVector || !Array.isArray(queryVector)) {
      return { results: [], error: "Failed to generate embedding" };
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase.rpc("match_embedding_sections", {
      query_embedding: JSON.stringify(queryVector),
      match_book_id: bookId,
      match_count: topK,
    });

    if (error) {
      console.error("[vector-search] RPC error:", error);
      return { results: [], error: error.message ?? "Vector search failed" };
    }

    const snippetLen = options?.snippetLength;

    const results: VectorSearchResult[] = (data ?? []).map((row: any) => {
      let content = row.content_text ?? "";
      if (snippetLen != null && content.length > snippetLen) {
        content = content.slice(0, snippetLen).trim() + "…";
      }
      return {
        content_text: content,
        start_position: row.start_position ?? null,
        end_position: row.end_position ?? null,
        similarity: typeof row.similarity === "number" ? row.similarity : null,
        section_id: row.id ?? undefined,
      };
    });

    return { results };
  } catch (err) {
    console.error("[vector-search] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : "Vector search failed";
    return { results: [], error: msg };
  }
}

export interface PassageContentResult {
  section_id: string;
  content_text: string;
  start_position: string | null;
  end_position: string | null;
}

/** Fetch full content for specific sections. Use after vector_search when you need full text to quote or cite. */
export async function getPassageContent(
  bookId: string,
  sectionIds: string[],
  userId: string | null
): Promise<{ passages: PassageContentResult[]; error?: string }> {
  if (sectionIds.length === 0) {
    return { passages: [] };
  }
  const uniqueIds = [...new Set(sectionIds)].slice(0, 20);

  try {
    if (userId) {
      const userClient = await createClient();
      const { data: userBook } = await userClient
        .from("user_books")
        .select("id")
        .eq("user_id", userId)
        .eq("book_id", bookId)
        .single();
      if (!userBook) {
        return { passages: [], error: "Access denied to this book" };
      }
    } else {
      const serviceSupabase = createServiceClient();
      const { data: book } = await serviceSupabase
        .from("books")
        .select("is_curated")
        .eq("id", bookId)
        .single();
      if (!book?.is_curated) {
        return { passages: [], error: "Access denied to this book" };
      }
    }

    const supabase = createServiceClient();
    const { data: sections, error } = await supabase
      .from("embedding_sections")
      .select("id, content_text, start_position, end_position")
      .eq("book_id", bookId)
      .in("id", uniqueIds);

    if (error) {
      console.error("[getPassageContent] Query error:", error);
      return { passages: [], error: error.message };
    }

    const passages: PassageContentResult[] = (sections ?? []).map((row) => ({
      section_id: row.id,
      content_text: row.content_text ?? "",
      start_position: row.start_position ?? null,
      end_position: row.end_position ?? null,
    }));

    return { passages };
  } catch (err) {
    console.error("[getPassageContent] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : "Failed to fetch passage content";
    return { passages: [], error: msg };
  }
}
