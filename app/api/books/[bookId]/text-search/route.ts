import { createClient } from "@/lib/supabase/server";
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

    const body = await request.json();
    const { query, limit = 10 } = body as { query?: string; limit?: number };

    if (!query || typeof query !== "string" || !query.trim()) {
      return NextResponse.json(
        { error: "query string is required" },
        { status: 400 }
      );
    }

    const { results, error } = await textSearch(bookId, user.id, query, limit);

    if (error) {
      if (error === "Access denied to this book") {
        return NextResponse.json({ error }, { status: 403 });
      }
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Text search error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Text search failed" },
      { status: 500 }
    );
  }
}
