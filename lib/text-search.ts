import { createClient } from "@/lib/supabase/server";

export interface TextSearchResult {
  content_text: string;
  start_position: string | null;
  end_position: string | null;
}

export async function textSearch(
  bookId: string,
  userId: string,
  query: string,
  limit = 10
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
  const searchPattern = `%${query.trim().replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;

  const { data, error } = await supabase
    .from("embedding_sections")
    .select("content_text, start_position, end_position")
    .eq("book_id", bookId)
    .ilike("content_text", searchPattern)
    .limit(maxResults);

  if (error) {
    return { results: [], error: error.message ?? "Text search failed" };
  }

  const results: TextSearchResult[] = (data ?? []).map((row) => ({
    content_text: row.content_text ?? "",
    start_position: row.start_position ?? null,
    end_position: row.end_position ?? null,
  }));

  return { results };
}
