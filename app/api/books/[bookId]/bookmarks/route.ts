import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
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
    const bookmarks = Array.isArray(body.bookmarks)
      ? (body.bookmarks as unknown[]).filter((p): p is number => typeof p === "number" && Number.isInteger(p) && p >= 1)
      : undefined;
    if (bookmarks === undefined) {
      return NextResponse.json(
        { error: "Provide bookmarks (array of positive integers)" },
        { status: 400 }
      );
    }
    const next = [...bookmarks].sort((a, b) => a - b);

    const { data: existing, error: fetchError } = await supabase
      .from("user_books")
      .select("id")
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Book not found in your library" },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("user_books")
      .update({
        bookmarks: next,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .select("bookmarks")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ bookmarks: data.bookmarks ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to toggle bookmark" },
      { status: 500 }
    );
  }
}
