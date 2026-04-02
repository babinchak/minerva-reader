import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { bookId } = await params;
    const body = await request.json();

    const allowedFields: Record<string, string> = { isCurated: "is_curated" };
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      const col = allowedFields[key];
      if (col !== undefined) updates[col] = value;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { error: updateError } = await serviceSupabase
      .from("books")
      .update(updates)
      .eq("id", bookId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ADMIN] Patch book error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { bookId } = await params;

    const { data: book, error: bookError } = await serviceSupabase
      .from("books")
      .select("id, storage_path, cover_path, book_type")
      .eq("id", bookId)
      .single();

    if (bookError || !book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // 1. Null parent refs for summaries (self-reference), then delete summaries
    // (user_books, chats, chat_messages cascade from book deletion)
    const { data: summaryRows } = await serviceSupabase
      .from("summaries")
      .select("id")
      .eq("book_id", bookId);
    const summaryIds = (summaryRows ?? []).map((s) => s.id);
    if (summaryIds.length > 0) {
      await serviceSupabase
        .from("summaries")
        .update({ parent_summary_id: null })
        .eq("book_id", bookId)
        .in("parent_summary_id", summaryIds);
    }
    await serviceSupabase.from("summaries").delete().eq("book_id", bookId);

    // 2. Delete embedding_sections
    await serviceSupabase.from("embedding_sections").delete().eq("book_id", bookId);

    // 3. Delete storage files
    const bucketName = book.book_type === "pdf" ? "pdfs" : "epubs";
    if (book.storage_path) {
      await serviceSupabase.storage.from(bucketName).remove([book.storage_path]);
    }
    if (book.cover_path) {
      await serviceSupabase.storage.from("covers").remove([book.cover_path]);
    }
    const manifestPath = `books/${bookId}/manifest.json`;
    await serviceSupabase.storage.from("readium-manifests").remove([manifestPath]);

    // 4. Delete the book row (user_books, chats, chat_messages cascade automatically)
    const { error: deleteError } = await serviceSupabase.from("books").delete().eq("id", bookId);

    if (deleteError) {
      console.error("[ADMIN] Book delete error:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete book", details: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ADMIN] Delete book error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
