import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { bookId } = await params;
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

    const { data: { user } } = await supabase.auth.getUser();

    const { data: book, error: bookError } = await serviceSupabase
      .from("books")
      .select("title, author, summaries_processed_at, vectors_processed_at, is_curated")
      .eq("id", bookId)
      .single();

    if (bookError || !book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    if (user) {
      const { data: userBook } = await supabase
        .from("user_books")
        .select("id")
        .eq("user_id", user.id)
        .eq("book_id", bookId)
        .single();
      if (!userBook && !book.is_curated) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    } else {
      if (!book.is_curated) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    return NextResponse.json({
      title: book.title ?? "",
      author: book.author ?? "",
      summaries_processed_at: book.summaries_processed_at ?? null,
      vectors_processed_at: book.vectors_processed_at ?? null,
    });
  } catch (err) {
    console.error("[metadata] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
