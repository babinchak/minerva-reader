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
    const { currentPage, readingPosition } = body;

    // Validate: must have at least one position to save
    const hasPdfPosition = typeof currentPage === "number" && currentPage >= 1;
    const hasEpubPosition =
      readingPosition &&
      typeof readingPosition === "object" &&
      readingPosition.href;

    if (!hasPdfPosition && !hasEpubPosition) {
      return NextResponse.json(
        { error: "Provide currentPage (number) for PDF or readingPosition (object) for EPUB" },
        { status: 400 }
      );
    }

    // Build update object - only set the relevant fields
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (hasPdfPosition) {
      updates.current_page = currentPage;
      updates.reading_position = null; // Clear EPUB position when saving PDF
    }
    if (hasEpubPosition) {
      updates.reading_position = readingPosition;
      updates.current_page = null; // Clear PDF position when saving EPUB (user switched to EPUB)
    }

    const { data, error } = await supabase
      .from("user_books")
      .update(updates)
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .select("current_page, reading_position, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save position" },
      { status: 500 }
    );
  }
}
