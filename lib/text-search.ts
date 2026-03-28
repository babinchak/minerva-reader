import { createClient, createServiceClient } from "@/lib/supabase/server";

export interface MultiBookTextSearchResult extends TextSearchResult {
  book_id: string;
  book_title: string | null;
  book_author: string | null;
  book_type: string | null;
}

export interface TextSearchResult {
  content_text: string;
  start_position: string | null;
  end_position: string | null;
  page_breaks: number[] | null;
  section_id?: string;
}

export interface TextSearchOptions {
  /** When set, truncate content_text to this length. Omit for full content. */
  snippetLength?: number;
  /**
   * When set, return a local window around the matched word instead of the full section.
   * Extracts (buffer) chars before and after the first match. Keeps token cost low for large sections.
   */
  matchContextChars?: number;
}

export async function textSearch(
  bookId: string,
  userId: string | null,
  query: string,
  limit = 10,
  options?: TextSearchOptions
): Promise<{ results: TextSearchResult[]; error?: string }> {
  const supabase = await createClient();
  const serviceSupabase = createServiceClient();

  if (userId) {
    const { data: userBook } = await supabase
      .from("user_books")
      .select("id")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .single();
    if (!userBook) {
      return { results: [], error: "Access denied to this book" };
    }
  } else {
    const { data: book } = await serviceSupabase
      .from("books")
      .select("is_curated")
      .eq("id", bookId)
      .single();
    if (!book?.is_curated) {
      return { results: [], error: "Access denied to this book" };
    }
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

  // Escape for ILIKE: % and _ are wildcards
  const escapeForIlike = (s: string) => s.replace(/%/g, "\\%").replace(/_/g, "\\_");
  // Escape for JS regex (used when extracting match context)
  const escapeForRegex = (s: string) =>
    s.replace(/[\\[\](){}?*+^$.|]/g, "\\$&");

  const db = userId ? supabase : serviceSupabase;
  let queryBuilder = db
    .from("embedding_sections")
    .select("id, content_text, start_position, end_position, page_breaks")
    .eq("book_id", bookId);

  if (terms.length === 0) {
    return { results: [], error: "Empty search query" };
  }
  // ILIKE substring match (PostgREST can't parse regex with parentheses in filter values).
  // Word-boundary filtering happens in post-processing when extracting match context.
  if (terms.length === 1) {
    const pattern = `%${escapeForIlike(terms[0])}%`;
    queryBuilder = queryBuilder.ilike("content_text", pattern);
  } else {
    const orConditions = terms
      .map((t) => `content_text.ilike.%${escapeForIlike(t)}%`)
      .join(",");
    queryBuilder = queryBuilder.or(orConditions);
  }

  const matchCtx = options?.matchContextChars ?? 200;
  const fetchLimit = matchCtx > 0 ? Math.min(maxResults * 3, 50) : maxResults;
  const { data, error } = await queryBuilder.limit(fetchLimit);

  if (error) {
    return { results: [], error: error.message ?? "Text search failed" };
  }

  const snippetLen = options?.snippetLength;
  const escapedTerms = terms.map(escapeForRegex);

  const results: TextSearchResult[] = [];
  const re = new RegExp(`\\b(${escapedTerms.join("|")})\\b`, "gi");
  for (const row of data ?? []) {
    re.lastIndex = 0;
    let content = row.content_text ?? "";
    const match = re.exec(content);
    if (!match && matchCtx > 0) {
      continue;
    }
    if (match && matchCtx > 0 && content.length > matchCtx * 2) {
      const start = Math.max(0, match.index - matchCtx);
      const end = Math.min(content.length, match.index + match[0].length + matchCtx);
      const excerpt = content.slice(start, end);
      content = (start > 0 ? "…" : "") + excerpt + (end < content.length ? "…" : "");
    }
    if (snippetLen != null && content.length > snippetLen) {
      content = content.slice(0, snippetLen).trim() + "…";
    }
    results.push({
      content_text: content,
      start_position: row.start_position ?? null,
      end_position: row.end_position ?? null,
      page_breaks: Array.isArray((row as any).page_breaks) ? (row as any).page_breaks : null,
      section_id: row.id,
    });
    if (results.length >= maxResults) break;
  }

  return { results };
}

export async function textSearchMulti(
  bookIds: string[],
  userId: string | null,
  query: string,
  limit = 10,
  options?: TextSearchOptions
): Promise<{ results: MultiBookTextSearchResult[]; error?: string }> {
  if (bookIds.length === 0) {
    return { results: [], error: "No books provided" };
  }

  const serviceSupabase = createServiceClient();
  const maxResults = Math.min(Math.max(1, limit), 50);

  const rawTerms = query
    .split(/\s*\|\s*/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 5);

  const terms = rawTerms.map((t) => {
    if (t.length > 50 || t.split(/\s+/).length > 4) {
      const words = t.split(/\s+/).filter((w) => w.length > 2);
      return words.slice(0, 3).join(" ") || words[0] || t.slice(0, 30);
    }
    return t;
  });

  if (terms.length === 0) {
    return { results: [], error: "Empty search query" };
  }

  const escapeForIlike = (s: string) => s.replace(/%/g, "\\%").replace(/_/g, "\\_");
  const escapeForRegex = (s: string) =>
    s.replace(/[\\[\](){}?*+^$.|]/g, "\\$&");

  let queryBuilder = serviceSupabase
    .from("embedding_sections")
    .select("id, book_id, content_text, start_position, end_position, page_breaks")
    .in("book_id", bookIds);

  if (terms.length === 1) {
    const pattern = `%${escapeForIlike(terms[0])}%`;
    queryBuilder = queryBuilder.ilike("content_text", pattern);
  } else {
    const orConditions = terms
      .map((t) => `content_text.ilike.%${escapeForIlike(t)}%`)
      .join(",");
    queryBuilder = queryBuilder.or(orConditions);
  }

  const matchCtx = options?.matchContextChars ?? 200;
  const fetchLimit = matchCtx > 0 ? Math.min(maxResults * 3, 50) : maxResults;
  const { data, error } = await queryBuilder.limit(fetchLimit);

  if (error) {
    return { results: [], error: error.message ?? "Text search failed" };
  }

  // Fetch book metadata for results
  const bookIdsInResults = [...new Set((data ?? []).map((row: any) => row.book_id))];
  const { data: booksData } = await serviceSupabase
    .from("books")
    .select("id, title, author, book_type")
    .in("id", bookIdsInResults);
  const bookMap = new Map((booksData ?? []).map((b: any) => [b.id, b]));

  const snippetLen = options?.snippetLength;
  const escapedTerms = terms.map(escapeForRegex);
  const results: MultiBookTextSearchResult[] = [];
  const re = new RegExp(`\\b(${escapedTerms.join("|")})\\b`, "gi");

  for (const row of data ?? []) {
    re.lastIndex = 0;
    let content = row.content_text ?? "";
    const match = re.exec(content);
    if (!match && matchCtx > 0) {
      continue;
    }
    if (match && matchCtx > 0 && content.length > matchCtx * 2) {
      const start = Math.max(0, match.index - matchCtx);
      const end = Math.min(content.length, match.index + match[0].length + matchCtx);
      const excerpt = content.slice(start, end);
      content = (start > 0 ? "…" : "") + excerpt + (end < content.length ? "…" : "");
    }
    if (snippetLen != null && content.length > snippetLen) {
      content = content.slice(0, snippetLen).trim() + "…";
    }
    const book = bookMap.get(row.book_id);
    results.push({
      content_text: content,
      start_position: row.start_position ?? null,
      end_position: row.end_position ?? null,
      page_breaks: Array.isArray((row as any).page_breaks) ? (row as any).page_breaks : null,
      section_id: row.id,
      book_id: row.book_id,
      book_title: book?.title ?? null,
      book_author: book?.author ?? null,
      book_type: book?.book_type ?? null,
    });
    if (results.length >= maxResults) break;
  }

  return { results };
}
