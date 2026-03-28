import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Lookup a section by its globally unique ID (no bookId required).
 * Used by the library-mode AI assistant where sections come from multiple books.
 * Returns section data plus the bookId so the frontend can build navigation URLs.
 */
export async function GET(request: NextRequest) {
  try {
    const sectionId = request.nextUrl.searchParams.get("sectionId");
    if (!sectionId) {
      return NextResponse.json({ error: "sectionId is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const serviceSupabase = createServiceClient();

    // Fetch the section (no book_id filter — section IDs are globally unique)
    const { data: section, error } = await serviceSupabase
      .from("embedding_sections")
      .select("id, book_id, content_text, start_position, end_position, page_breaks")
      .eq("id", sectionId)
      .single();

    if (error || !section) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    // Access check: user owns book OR book is curated
    if (user) {
      const { data: userBook } = await supabase
        .from("user_books")
        .select("id")
        .eq("user_id", user.id)
        .eq("book_id", section.book_id)
        .single();
      if (!userBook) {
        const { data: book } = await serviceSupabase
          .from("books")
          .select("is_curated")
          .eq("id", section.book_id)
          .single();
        if (!book?.is_curated) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }
      }
    } else {
      const { data: book } = await serviceSupabase
        .from("books")
        .select("is_curated")
        .eq("id", section.book_id)
        .single();
      if (!book?.is_curated) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    // Fetch book metadata for the section
    const { data: book } = await serviceSupabase
      .from("books")
      .select("id, title, author, book_type")
      .eq("id", section.book_id)
      .single();

    return NextResponse.json({
      sectionId: section.id,
      bookId: section.book_id,
      startPosition: section.start_position,
      pageBreaks: section.page_breaks ?? null,
      contentText: section.content_text ?? null,
      bookTitle: book?.title ?? null,
      bookAuthor: book?.author ?? null,
      bookType: book?.book_type ?? null,
    });
  } catch (err) {
    console.error("Section lookup error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "An error occurred" },
      { status: 500 }
    );
  }
}
