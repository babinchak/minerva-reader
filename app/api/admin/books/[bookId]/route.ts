import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";

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

    // 1. Delete chat_messages for chats referencing this book (then delete chats)
    const { data: chats } = await serviceSupabase
      .from("chats")
      .select("id")
      .eq("book_id", bookId);
    const chatIds = (chats ?? []).map((c) => c.id);
    if (chatIds.length > 0) {
      await serviceSupabase.from("chat_messages").delete().in("chat_id", chatIds);
      await serviceSupabase.from("chats").delete().eq("book_id", bookId);
    }

    // 2. Delete user_books
    await serviceSupabase.from("user_books").delete().eq("book_id", bookId);

    // 3. Null parent refs for summaries (self-reference), then delete summaries
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

    // 4. Delete embedding_sections (includes pgvector embeddings)
    await serviceSupabase.from("embedding_sections").delete().eq("book_id", bookId);

    // 5. Delete storage files
    const bucketName = book.book_type === "pdf" ? "pdfs" : "epubs";
    if (book.storage_path) {
      await serviceSupabase.storage.from(bucketName).remove([book.storage_path]);
    }
    if (book.cover_path) {
      await serviceSupabase.storage.from("covers").remove([book.cover_path]);
    }
    const manifestPath = `books/${bookId}/manifest.json`;
    await serviceSupabase.storage.from("readium-manifests").remove([manifestPath]);

    // 6. Delete the book row
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
