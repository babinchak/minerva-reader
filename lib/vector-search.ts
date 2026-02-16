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

    // Query without filter - Supabase Vector filter causes 500 in alpha (see github.com/orgs/supabase/discussions/40815).
    // Request extra results and filter client-side by book_id.
    const requestTopK = Math.min(topK * 5, 100);
    const { data, error } = await index.queryVectors({
      queryVector: { float32: queryVector },
      topK: requestTopK,
      returnDistance: true,
      returnMetadata: true,
    });

    if (error) {
      console.error("[vector-search] Supabase query error:", error);
      return { results: [], error: error.message ?? "Vector search failed" };
    }

    const bookIdStr = String(bookId);
    const filtered = (data?.vectors ?? []).filter((v) => {
      const meta = (v.metadata ?? {}) as Record<string, unknown>;
      return String(meta.book_id ?? "") === bookIdStr;
    });
    const limited = filtered.slice(0, topK);

    // Vector keys are embedding_section ids; fetch content from embedding_sections
    const sectionIds = limited.map((v) => v.key).filter(Boolean);
    const sectionMap = new Map<string, { content_text: string; start_position: string | null; end_position: string | null }>();

    if (sectionIds.length > 0) {
      const { data: sections } = await supabase
        .from("embedding_sections")
        .select("id, content_text, start_position, end_position")
        .eq("book_id", bookId)
        .in("id", sectionIds);

      for (const row of sections ?? []) {
        sectionMap.set(row.id, {
          content_text: row.content_text ?? "",
          start_position: row.start_position ?? null,
          end_position: row.end_position ?? null,
        });
      }
    }

    const results: VectorSearchResult[] = limited.map((v) => {
      const fromDb = sectionMap.get(v.key);
      const meta = (v.metadata ?? {}) as Record<string, unknown>;
      return {
        content_text: fromDb?.content_text ?? String(meta.content_text ?? ""),
        start_position: fromDb?.start_position ?? (meta.start_position != null ? String(meta.start_position) : null),
        end_position: fromDb?.end_position ?? (meta.end_position != null ? String(meta.end_position) : null),
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
