import { createClient } from "@/lib/supabase/server";

export interface TextSearchResult {
  content_text: string;
  start_position: string | null;
  end_position: string | null;
  section_id?: string;
}

export interface TextSearchOptions {
  /** When set, truncate content_text to this length. Omit for full content. */
  snippetLength?: number;
}

export async function textSearch(
  bookId: string,
  userId: string,
  query: string,
  limit = 10,
  options?: TextSearchOptions
): Promise<{ results: TextSearchResult[]; error?: string }> {
  const supabase = await createClient();

  const { data: userBook } = await supabase
    .from("user_books")
    .select("id")
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .single();

  if (!userBook) {
    return { results: [], error: "Access denied to this book" };
  }

  const maxResults = Math.min(Math.max(1, limit), 50);
  // Support multiple terms with | (OR): e.g. "scarlet|velvet" or "Coke|coca-cola"
  const rawTerms = query
    .split(/\s*\|\s*/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 5); // max 5 terms for OR search

  const terms = rawTerms.map((t) => {
    if (t.length > 50 || t.split(/\s+/).length > 4) {
      const words = t.split(/\s+/).filter((w) => w.length > 2);
      return words.slice(0, 3).join(" ") || words[0] || t.slice(0, 30);
    }
    return t;
  });

  const escapeForIlike = (s: string) => s.replace(/%/g, "\\%").replace(/_/g, "\\_");

  let queryBuilder = supabase
    .from("embedding_sections")
    .select("id, content_text, start_position, end_position")
    .eq("book_id", bookId);

  if (terms.length === 0) {
    return { results: [], error: "Empty search query" };
  }
  if (terms.length === 1) {
    const pattern = `%${escapeForIlike(terms[0])}%`;
    queryBuilder = queryBuilder.ilike("content_text", pattern);
  } else {
    const orConditions = terms
      .map((t) => `content_text.ilike.%${escapeForIlike(t)}%`)
      .join(",");
    queryBuilder = queryBuilder.or(orConditions);
  }

  const { data, error } = await queryBuilder.limit(maxResults);

  if (error) {
    return { results: [], error: error.message ?? "Text search failed" };
  }

  const snippetLen = options?.snippetLength;

  const results: TextSearchResult[] = (data ?? []).map((row) => {
    let content = row.content_text ?? "";
    if (snippetLen != null && content.length > snippetLen) {
      content = content.slice(0, snippetLen).trim() + "…";
    }
    return {
      content_text: content,
      start_position: row.start_position ?? null,
      end_position: row.end_position ?? null,
      section_id: row.id,
    };
  });

  return { results };
}
