import { createServiceClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const VECTOR_BUCKET = process.env.VECTOR_BUCKET_NAME ?? "book-embeddings";
const VECTOR_INDEX = process.env.VECTOR_INDEX_NAME ?? "sections-openai";
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

export interface VectorSearchResult {
  content_text: string;
  start_position: string | null;
  end_position: string | null;
  similarity: number | null;
}

export async function vectorSearch(
  bookId: string,
  query: string,
  limit = 10
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
    });
    const queryVector = embeddingResponse.data[0]?.embedding;
    if (!queryVector || !Array.isArray(queryVector)) {
      return { results: [], error: "Failed to generate embedding" };
    }

    const supabase = createServiceClient();
    const index = supabase.storage.vectors.from(VECTOR_BUCKET).index(VECTOR_INDEX);
    const { data, error } = await index.queryVectors({
      queryVector: { float32: queryVector },
      topK,
      filter: { book_id: bookId },
      returnDistance: true,
      returnMetadata: true,
    });

    if (error) {
      console.error("[vector-search] Supabase query error:", error);
      return { results: [], error: error.message ?? "Vector search failed" };
    }

    const results: VectorSearchResult[] = (data?.vectors ?? []).map((v) => {
      const meta = (v.metadata ?? {}) as Record<string, unknown>;
      return {
        content_text: String(meta.content_text ?? ""),
        start_position: meta.start_position != null ? String(meta.start_position) : null,
        end_position: meta.end_position != null ? String(meta.end_position) : null,
        similarity: typeof v.distance === "number" ? 1 - v.distance : null,
      };
    });

    return { results };
  } catch (err) {
    console.error("[vector-search] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : "Vector search failed";
    return { results: [], error: msg };
  }
}
