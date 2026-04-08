import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { bookId } = await params;
    const sectionId = request.nextUrl.searchParams.get("sectionId");
    if (!sectionId) {
      return NextResponse.json({ error: "sectionId is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Access check: user owns book OR book is curated
    const serviceSupabase = createServiceClient();
    if (user) {
      const { data: userBook } = await supabase
        .from("user_books")
        .select("id")
        .eq("user_id", user.id)
        .eq("book_id", bookId)
        .single();
      if (!userBook) {
        const { data: book } = await serviceSupabase
          .from("books")
          .select("is_curated")
          .eq("id", bookId)
          .single();
        if (!book?.is_curated) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }
      }
    } else {
      const { data: book } = await serviceSupabase
        .from("books")
        .select("is_curated")
        .eq("id", bookId)
        .single();
      if (!book?.is_curated) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    const { data: section, error } = await serviceSupabase
      .from("embedding_sections")
      .select("id, content_text, start_position, end_position, page_breaks, xhtml_breaks")
      .eq("id", sectionId)
      .eq("book_id", bookId)
      .single();

    if (error || !section) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    return NextResponse.json({
      sectionId: section.id,
      startPosition: section.start_position,
      endPosition: section.end_position ?? null,
      pageBreaks: section.page_breaks ?? null,
      xhtmlBreaks: (section as any).xhtml_breaks ?? null,
      contentText: section.content_text ?? null,
    });
  } catch (err) {
    console.error("Section lookup error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "An error occurred" },
      { status: 500 }
    );
  }
}
