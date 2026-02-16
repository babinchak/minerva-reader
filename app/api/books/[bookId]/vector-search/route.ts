import { createClient } from "@/lib/supabase/server";
import { vectorSearch } from "@/lib/vector-search";
import { textSearch } from "@/lib/text-search";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { bookId } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userBook } = await supabase
      .from("user_books")
      .select("id")
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .single();

    if (!userBook) {
      return NextResponse.json({ error: "Access denied to this book" }, { status: 403 });
    }

    const body = await request.json();
    const { query, limit = 10 } = body as { query?: string; limit?: number };

    if (!query || typeof query !== "string" || !query.trim()) {
      return NextResponse.json(
        { error: "query string is required" },
        { status: 400 }
      );
    }

    let { results, error } = await vectorSearch(bookId, query, limit);

    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    // Fallback to text search when vector bucket is empty (e.g. vectors_processed_at is null)
    if (results.length === 0) {
      const firstWord = query.trim().split(/\s+/).find((w) => w.length > 2) ?? query.trim().split(/\s+/)[0] ?? query;
      if (firstWord) {
        const { results: textResults } = await textSearch(bookId, user.id, firstWord, limit);
        if (textResults.length > 0) {
          return NextResponse.json({
            results: textResults.map((r) => ({
              content_text: r.content_text,
              start_position: r.start_position,
              end_position: r.end_position,
              similarity: null,
            })),
            fallback: "keyword",
          });
        }
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Vector search error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Vector search failed" },
      { status: 500 }
    );
  }
}
