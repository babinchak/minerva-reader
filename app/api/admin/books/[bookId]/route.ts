import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";

const VECTOR_BUCKET = process.env.VECTOR_BUCKET_NAME ?? "book-embeddings";
const VECTOR_INDEX = process.env.VECTOR_INDEX_NAME ?? "sections-openai";

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

    // 1. Delete vectors from Supabase Vector storage (keys = embedding_section ids)
    const { data: sections } = await serviceSupabase
      .from("embedding_sections")
      .select("id")
      .eq("book_id", bookId);
    const sectionIds = (sections ?? []).map((s) => s.id);
    if (sectionIds.length > 0) {
      try {
        const bucket = serviceSupabase.storage.vectors.from(VECTOR_BUCKET);
        const index = bucket.index(VECTOR_INDEX);
        await index.deleteVectors({ keys: sectionIds });
      } catch (vecErr) {
        console.warn("[ADMIN] Vector deletion failed (non-fatal):", vecErr);
      }
    }

    // 2. Delete chat_messages for chats referencing this book (then delete chats)
    const { data: chats } = await serviceSupabase
      .from("chats")
      .select("id")
      .eq("book_id", bookId);
    const chatIds = (chats ?? []).map((c) => c.id);
    if (chatIds.length > 0) {
      await serviceSupabase.from("chat_messages").delete().in("chat_id", chatIds);
      await serviceSupabase.from("chats").delete().eq("book_id", bookId);
    }

    // 3. Delete user_books
    await serviceSupabase.from("user_books").delete().eq("book_id", bookId);

    // 4. Null parent refs for summaries (self-reference), then delete summaries
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

    // 5. Delete embedding_sections
    await serviceSupabase.from("embedding_sections").delete().eq("book_id", bookId);

    // 6. Delete storage files
    const bucketName = book.book_type === "pdf" ? "pdfs" : "epubs";
    if (book.storage_path) {
      await serviceSupabase.storage.from(bucketName).remove([book.storage_path]);
    }
    if (book.cover_path) {
      await serviceSupabase.storage.from("covers").remove([book.cover_path]);
    }
    const manifestPath = `books/${bookId}/manifest.json`;
    await serviceSupabase.storage.from("readium-manifests").remove([manifestPath]);

    // 7. Delete the book row
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
