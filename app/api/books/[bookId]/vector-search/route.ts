import { createClient } from "@/lib/supabase/server";
import { vectorSearch } from "@/lib/vector-search";
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

    const { results, error } = await vectorSearch(bookId, query, limit);

    if (error) {
      return NextResponse.json({ error }, { status: 500 });
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
