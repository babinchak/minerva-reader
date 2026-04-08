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
  xhtml_breaks: number[] | null;
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
    .select("id, content_text, start_position, end_position, page_breaks, xhtml_breaks")
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
    let startPos: string | null = row.start_position ?? null;
    let pageBreaks: number[] | null = Array.isArray((row as any).page_breaks) ? (row as any).page_breaks : null;
    let xhtmlBreaks: number[] | null = Array.isArray((row as any).xhtml_breaks) ? (row as any).xhtml_breaks : null;
    const match = re.exec(content);
    if (!match && matchCtx > 0) {
      continue;
    }
    if (match && matchCtx > 0 && content.length > matchCtx * 2) {
      const winStart = Math.max(0, match.index - matchCtx);
      const end = Math.min(content.length, match.index + match[0].length + matchCtx);
      const excerpt = content.slice(winStart, end);
      const prefix = winStart > 0 ? "…" : "";
      content = prefix + excerpt + (end < content.length ? "…" : "");
      // Adjust page_breaks and start_position to match the windowed content.
      // Breaks before the window mean the window starts on a later page;
      // breaks within the window need their offsets shifted.
      if (pageBreaks) {
        const prefixLen = prefix.length;
        let skippedBreaks = 0;
        const adjusted: number[] = [];
        for (const offset of pageBreaks) {
          const shifted = offset - winStart + prefixLen;
          if (shifted < 0) {
            skippedBreaks++;
          } else if (shifted < content.length) {
            adjusted.push(shifted);
          }
        }
        pageBreaks = adjusted;
        // Advance start_position past breaks that fell before the window.
        // Only applies to PDFs where start_position is a plain page number.
        // EPUB positions contain "/" (e.g. "134/0/6") and must not be adjusted.
        if (skippedBreaks > 0 && startPos != null && !startPos.includes("/")) {
          const parsed = parseInt(startPos, 10);
          if (!Number.isNaN(parsed)) {
            startPos = String(parsed + skippedBreaks);
          }
        }
      }
      // Adjust xhtml_breaks the same way as page_breaks
      if (xhtmlBreaks) {
        const prefixLen = prefix.length;
        let skippedXhtml = 0;
        const adjusted: number[] = [];
        for (const offset of xhtmlBreaks) {
          const shifted = offset - winStart + prefixLen;
          if (shifted < 0) {
            skippedXhtml++;
          } else if (shifted < content.length) {
            adjusted.push(shifted);
          }
        }
        xhtmlBreaks = adjusted;
        // Advance reading order in start_position for skipped xhtml transitions
        if (skippedXhtml > 0 && startPos != null && startPos.includes("/")) {
          const parts = startPos.split("/");
          const ro = parseInt(parts[0], 10);
          if (!Number.isNaN(ro)) {
            startPos = `${ro + skippedXhtml}/${parts.slice(1).join("/")}`;
          }
        }
      }
    }
    if (snippetLen != null && content.length > snippetLen) {
      content = content.slice(0, snippetLen).trim() + "…";
    }
    results.push({
      content_text: content,
      start_position: startPos,
      end_position: row.end_position ?? null,
      page_breaks: pageBreaks,
      xhtml_breaks: xhtmlBreaks,
      section_id: row.id,
    });
    if (results.length >= maxResults) break;
  }

  return { results };
}

export interface MultiBookTextSearchOptions extends TextSearchOptions {
  /** Max results from any single book. Ensures diversity across books. */
  maxPerBook?: number;
}

export async function textSearchMulti(
  bookIds: string[],
  userId: string | null,
  query: string,
  limit = 10,
  options?: MultiBookTextSearchOptions
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
    .select("id, book_id, content_text, start_position, end_position, page_breaks, xhtml_breaks")
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
  const perBookMax = options?.maxPerBook != null ? Math.max(1, options.maxPerBook) : null;
  const perBookCount = new Map<string, number>();

  for (const row of data ?? []) {
    // Enforce per-book limit
    if (perBookMax != null) {
      const count = perBookCount.get(row.book_id) ?? 0;
      if (count >= perBookMax) continue;
    }

    re.lastIndex = 0;
    let content = row.content_text ?? "";
    let startPos: string | null = row.start_position ?? null;
    let pageBreaks: number[] | null = Array.isArray((row as any).page_breaks) ? (row as any).page_breaks : null;
    let xhtmlBreaks: number[] | null = Array.isArray((row as any).xhtml_breaks) ? (row as any).xhtml_breaks : null;
    const match = re.exec(content);
    if (!match && matchCtx > 0) {
      continue;
    }
    if (match && matchCtx > 0 && content.length > matchCtx * 2) {
      const winStart = Math.max(0, match.index - matchCtx);
      const end = Math.min(content.length, match.index + match[0].length + matchCtx);
      const excerpt = content.slice(winStart, end);
      const prefix = winStart > 0 ? "…" : "";
      content = prefix + excerpt + (end < content.length ? "…" : "");
      // Adjust page_breaks and start_position to match the windowed content
      if (pageBreaks) {
        const prefixLen = prefix.length;
        let skippedBreaks = 0;
        const adjusted: number[] = [];
        for (const offset of pageBreaks) {
          const shifted = offset - winStart + prefixLen;
          if (shifted < 0) {
            skippedBreaks++;
          } else if (shifted < content.length) {
            adjusted.push(shifted);
          }
        }
        pageBreaks = adjusted;
        // Only adjust for PDFs (plain page number). EPUB positions contain "/" and must not be modified.
        if (skippedBreaks > 0 && startPos != null && !startPos.includes("/")) {
          const parsed = parseInt(startPos, 10);
          if (!Number.isNaN(parsed)) {
            startPos = String(parsed + skippedBreaks);
          }
        }
      }
      // Adjust xhtml_breaks the same way
      if (xhtmlBreaks) {
        const prefixLen = prefix.length;
        let skippedXhtml = 0;
        const adjusted: number[] = [];
        for (const offset of xhtmlBreaks) {
          const shifted = offset - winStart + prefixLen;
          if (shifted < 0) {
            skippedXhtml++;
          } else if (shifted < content.length) {
            adjusted.push(shifted);
          }
        }
        xhtmlBreaks = adjusted;
        // Advance reading order in start_position for skipped xhtml transitions
        if (skippedXhtml > 0 && startPos != null && startPos.includes("/")) {
          const parts = startPos.split("/");
          const ro = parseInt(parts[0], 10);
          if (!Number.isNaN(ro)) {
            startPos = `${ro + skippedXhtml}/${parts.slice(1).join("/")}`;
          }
        }
      }
    }
    if (snippetLen != null && content.length > snippetLen) {
      content = content.slice(0, snippetLen).trim() + "…";
    }
    const book = bookMap.get(row.book_id);
    results.push({
      content_text: content,
      start_position: startPos,
      end_position: row.end_position ?? null,
      page_breaks: pageBreaks,
      xhtml_breaks: xhtmlBreaks,
      section_id: row.id,
      book_id: row.book_id,
      book_title: book?.title ?? null,
      book_author: book?.author ?? null,
      book_type: book?.book_type ?? null,
    });
    perBookCount.set(row.book_id, (perBookCount.get(row.book_id) ?? 0) + 1);
    if (results.length >= maxResults) break;
  }

  return { results };
}
