import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-large";

/** Max chunks per range request to prevent accidental huge fetches. */
const MAX_RANGE_WIDTH = 10;

export interface VectorSearchResult {
  content_text: string;
  start_position: string | null;
  end_position: string | null;
  page_breaks: number[] | null;
  xhtml_breaks: number[] | null;
  similarity: number | null;
  section_id?: string;
  section_index?: number;
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
        page_breaks: Array.isArray(row.page_breaks) ? row.page_breaks : null,
        xhtml_breaks: Array.isArray(row.xhtml_breaks) ? row.xhtml_breaks : null,
        similarity: typeof row.similarity === "number" ? row.similarity : null,
        section_id: row.id ?? undefined,
        section_index: typeof row.section_index === "number" ? row.section_index : undefined,
      };
    });

    return { results };
  } catch (err) {
    console.error("[vector-search] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : "Vector search failed";
    return { results: [], error: msg };
  }
}

export interface MultiBookVectorSearchResult extends VectorSearchResult {
  book_id: string;
  book_title: string | null;
  book_author: string | null;
  book_type: string | null;
}

export interface MultiBookVectorSearchOptions extends VectorSearchOptions {
  /** Max results from any single book. Ensures diversity across books. */
  maxPerBook?: number;
}

export async function vectorSearchMulti(
  bookIds: string[],
  query: string,
  limit = 10,
  options?: MultiBookVectorSearchOptions
): Promise<{ results: MultiBookVectorSearchResult[]; error?: string }> {
  const topK = Math.min(Math.max(1, limit), 50);

  if (!process.env.OPENAI_API_KEY) {
    return { results: [], error: "OpenAI API key is not configured" };
  }
  if (bookIds.length === 0) {
    return { results: [], error: "No books provided" };
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

    const rpcParams: Record<string, unknown> = {
      query_embedding: JSON.stringify(queryVector),
      match_book_ids: bookIds,
      match_count: topK,
    };
    if (options?.maxPerBook != null) {
      rpcParams.max_per_book = Math.max(1, options.maxPerBook);
    }
    const { data, error } = await supabase.rpc("match_embedding_sections_multi", rpcParams);

    if (error) {
      console.error("[vector-search-multi] RPC error:", error);
      return { results: [], error: error.message ?? "Vector search failed" };
    }

    const snippetLen = options?.snippetLength;

    const results: MultiBookVectorSearchResult[] = (data ?? []).map((row: any) => {
      let content = row.content_text ?? "";
      if (snippetLen != null && content.length > snippetLen) {
        content = content.slice(0, snippetLen).trim() + "…";
      }
      return {
        content_text: content,
        start_position: row.start_position ?? null,
        end_position: row.end_position ?? null,
        page_breaks: Array.isArray(row.page_breaks) ? row.page_breaks : null,
        xhtml_breaks: Array.isArray(row.xhtml_breaks) ? row.xhtml_breaks : null,
        similarity: typeof row.similarity === "number" ? row.similarity : null,
        section_id: row.id ?? undefined,
        section_index: typeof row.section_index === "number" ? row.section_index : undefined,
        book_id: row.book_id,
        book_title: row.book_title ?? null,
        book_author: row.book_author ?? null,
        book_type: row.book_type ?? null,
      };
    });

    return { results };
  } catch (err) {
    console.error("[vector-search-multi] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : "Vector search failed";
    return { results: [], error: msg };
  }
}

// --- Range-based passage fetching ---

export interface ChunkInfo {
  section_id: string;
  section_index: number;
  char_offset: number;
}

export interface PassageResult {
  content_text: string;
  start_position: string | null;
  end_position: string | null;
  page_breaks: number[] | null;
  xhtml_breaks: number[] | null;
  chunks: ChunkInfo[];
}

export interface MultiBookPassageResult extends PassageResult {
  book_id: string;
  book_title: string | null;
  book_author: string | null;
  book_type: string | null;
}

export interface IndexRange {
  start: number;
  end: number;
}

export interface MultiBookIndexRange extends IndexRange {
  book_id: string;
}

/**
 * Merge chunks into a single passage with merged page_breaks and chunk metadata.
 */
function mergeChunks(
  chunks: Array<{ id: string; section_index: number; content_text: string; start_position: string | null; end_position: string | null; page_breaks: number[] | null; xhtml_breaks: number[] | null }>
): PassageResult {
  const sorted = [...chunks].sort((a, b) => a.section_index - b.section_index);

  const mergedPageBreaks: number[] = [];
  const mergedXhtmlBreaks: number[] = [];
  const chunkInfos: ChunkInfo[] = [];
  let charOffset = 0;
  const textParts: string[] = [];

  for (const chunk of sorted) {
    const text = chunk.content_text ?? "";
    chunkInfos.push({
      section_id: chunk.id,
      section_index: chunk.section_index,
      char_offset: charOffset,
    });
    if (chunk.page_breaks && chunk.page_breaks.length > 0) {
      for (const pb of chunk.page_breaks) {
        mergedPageBreaks.push(pb + charOffset);
      }
    }
    if (chunk.xhtml_breaks && chunk.xhtml_breaks.length > 0) {
      for (const xb of chunk.xhtml_breaks) {
        mergedXhtmlBreaks.push(xb + charOffset);
      }
    }
    textParts.push(text);
    charOffset += text.length + 1; // +1 for space separator
  }

  return {
    content_text: textParts.join(" "),
    start_position: sorted[0]!.start_position ?? null,
    end_position: sorted[sorted.length - 1]!.end_position ?? null,
    page_breaks: mergedPageBreaks.length > 0 ? mergedPageBreaks : null,
    xhtml_breaks: mergedXhtmlBreaks.length > 0 ? mergedXhtmlBreaks : null,
    chunks: chunkInfos,
  };
}

/**
 * Fetch passages by section_index ranges for a single book.
 * Each range { start, end } fetches all chunks from start to end inclusive,
 * merges them into one continuous passage with combined page_breaks.
 */
export async function getPassagesByRange(
  bookId: string,
  ranges: IndexRange[],
  userId: string | null
): Promise<{ passages: PassageResult[]; error?: string }> {
  if (ranges.length === 0) {
    return { passages: [] };
  }

  try {
    // Access check
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

    // Clamp and collect all needed indices
    const allIndices = new Set<number>();
    const clampedRanges: IndexRange[] = [];
    for (const r of ranges) {
      const start = Math.max(0, r.start);
      const end = Math.max(start, Math.min(r.end, start + MAX_RANGE_WIDTH - 1));
      clampedRanges.push({ start, end });
      for (let i = start; i <= end; i++) {
        allIndices.add(i);
      }
    }

    const supabase = createServiceClient();
    const { data: chunks, error } = await supabase
      .from("embedding_sections")
      .select("id, section_index, content_text, start_position, end_position, page_breaks, xhtml_breaks")
      .eq("book_id", bookId)
      .in("section_index", [...allIndices]);

    if (error) {
      console.error("[getPassagesByRange] Query error:", error);
      return { passages: [], error: error.message };
    }

    const chunkByIndex = new Map<number, (typeof chunks)[number]>();
    for (const chunk of chunks ?? []) {
      chunkByIndex.set(chunk.section_index as number, chunk);
    }

    const passages: PassageResult[] = [];
    for (const r of clampedRanges) {
      const rangeChunks: Array<{ id: string; section_index: number; content_text: string; start_position: string | null; end_position: string | null; page_breaks: number[] | null; xhtml_breaks: number[] | null }> = [];
      for (let i = r.start; i <= r.end; i++) {
        const chunk = chunkByIndex.get(i);
        if (chunk) {
          rangeChunks.push({
            id: chunk.id,
            section_index: chunk.section_index as number,
            content_text: chunk.content_text ?? "",
            start_position: chunk.start_position ?? null,
            end_position: chunk.end_position ?? null,
            page_breaks: Array.isArray(chunk.page_breaks) ? chunk.page_breaks : null,
            xhtml_breaks: Array.isArray((chunk as any).xhtml_breaks) ? (chunk as any).xhtml_breaks : null,
          });
        }
      }
      if (rangeChunks.length > 0) {
        passages.push(mergeChunks(rangeChunks));
      }
    }

    return { passages };
  } catch (err) {
    console.error("[getPassagesByRange] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : "Failed to fetch passages";
    return { passages: [], error: msg };
  }
}

/**
 * Fetch passages by section_index ranges across multiple books.
 * Each range { book_id, start, end } fetches chunks for that book.
 */
export async function getPassagesByRangeMulti(
  ranges: MultiBookIndexRange[],
  userId: string | null,
  allowedBookIds: string[]
): Promise<{ passages: MultiBookPassageResult[]; error?: string }> {
  if (ranges.length === 0) {
    return { passages: [] };
  }

  try {
    const allowedSet = new Set(allowedBookIds);

    // Group ranges by book_id
    const rangesByBook = new Map<string, IndexRange[]>();
    for (const r of ranges) {
      if (!allowedSet.has(r.book_id)) continue;
      const start = Math.max(0, r.start);
      const end = Math.max(start, Math.min(r.end, start + MAX_RANGE_WIDTH - 1));
      if (!rangesByBook.has(r.book_id)) rangesByBook.set(r.book_id, []);
      rangesByBook.get(r.book_id)!.push({ start, end });
    }

    const supabase = createServiceClient();

    // Fetch chunks per book
    const allPassages: MultiBookPassageResult[] = [];

    for (const [bookId, bookRanges] of rangesByBook) {
      const allIndices = new Set<number>();
      for (const r of bookRanges) {
        for (let i = r.start; i <= r.end; i++) {
          allIndices.add(i);
        }
      }

      const { data: chunks, error } = await supabase
        .from("embedding_sections")
        .select("id, section_index, content_text, start_position, end_position, page_breaks, xhtml_breaks")
        .eq("book_id", bookId)
        .in("section_index", [...allIndices]);

      if (error) {
        console.error("[getPassagesByRangeMulti] Query error:", error);
        continue;
      }

      const chunkByIndex = new Map<number, (typeof chunks)[number]>();
      for (const chunk of chunks ?? []) {
        chunkByIndex.set(chunk.section_index as number, chunk);
      }

      for (const r of bookRanges) {
        const rangeChunks: Array<{ id: string; section_index: number; content_text: string; start_position: string | null; end_position: string | null; page_breaks: number[] | null; xhtml_breaks: number[] | null }> = [];
        for (let i = r.start; i <= r.end; i++) {
          const chunk = chunkByIndex.get(i);
          if (chunk) {
            rangeChunks.push({
              id: chunk.id,
              section_index: chunk.section_index as number,
              content_text: chunk.content_text ?? "",
              start_position: chunk.start_position ?? null,
              end_position: chunk.end_position ?? null,
              page_breaks: Array.isArray(chunk.page_breaks) ? chunk.page_breaks : null,
              xhtml_breaks: Array.isArray((chunk as any).xhtml_breaks) ? (chunk as any).xhtml_breaks : null,
            });
          }
        }
        if (rangeChunks.length > 0) {
          allPassages.push({
            ...mergeChunks(rangeChunks),
            book_id: bookId,
            book_title: null,
            book_author: null,
            book_type: null,
          });
        }
      }
    }

    // Fetch book metadata
    const bookIdsInResults = [...new Set(allPassages.map((p) => p.book_id))];
    if (bookIdsInResults.length > 0) {
      const { data: booksData } = await supabase
        .from("books")
        .select("id, title, author, book_type")
        .in("id", bookIdsInResults);
      const bookMap = new Map((booksData ?? []).map((b: any) => [b.id, b]));
      for (const p of allPassages) {
        const book = bookMap.get(p.book_id);
        if (book) {
          p.book_title = book.title ?? null;
          p.book_author = book.author ?? null;
          p.book_type = book.book_type ?? null;
        }
      }
    }

    return { passages: allPassages };
  } catch (err) {
    console.error("[getPassagesByRangeMulti] Unexpected error:", err);
    const msg = err instanceof Error ? err.message : "Failed to fetch passages";
    return { passages: [], error: msg };
  }
}
