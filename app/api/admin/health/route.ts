import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextResponse } from "next/server";

type Issue = {
  type: "orphaned_book" | "orphaned_embedding" | "empty_chat" | "missing_storage" | "orphaned_user_book";
  severity: "warning" | "error";
  description: string;
  resourceId: string;
  resourceName?: string;
};

export async function GET() {
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

    const issues: Issue[] = [];

    // 1. Books with 0 users (orphaned)
    const { data: allBooks } = await serviceSupabase
      .from("books")
      .select("id, title, storage_path, book_type, user_books(count)");

    const books = allBooks ?? [];
    const bookIds = new Set(books.map((b) => b.id));

    for (const book of books) {
      const userCount = (book as any).user_books?.[0]?.count ?? 0;
      if (userCount === 0) {
        issues.push({
          type: "orphaned_book",
          severity: "warning",
          description: `Book "${book.title}" has no users linked`,
          resourceId: book.id,
          resourceName: book.title,
        });
      }
    }

    // 2. Embedding sections referencing non-existent books
    const { data: embeddingSections } = await serviceSupabase
      .from("embedding_sections")
      .select("id, book_id");

    const orphanedEmbeddingBookIds = new Set<string>();
    for (const section of embeddingSections ?? []) {
      if (!bookIds.has(section.book_id)) {
        orphanedEmbeddingBookIds.add(section.book_id);
      }
    }
    for (const orphanedBookId of orphanedEmbeddingBookIds) {
      const count = (embeddingSections ?? []).filter((s) => s.book_id === orphanedBookId).length;
      issues.push({
        type: "orphaned_embedding",
        severity: "error",
        description: `${count} embedding sections reference deleted book`,
        resourceId: orphanedBookId,
      });
    }

    // 3. Chats with no messages
    const { data: chats } = await serviceSupabase
      .from("chats")
      .select("id, book_id, chat_messages(count)");

    for (const chat of chats ?? []) {
      const msgCount = (chat as any).chat_messages?.[0]?.count ?? 0;
      if (msgCount === 0) {
        issues.push({
          type: "empty_chat",
          severity: "warning",
          description: `Chat has no messages`,
          resourceId: chat.id,
        });
      }
    }

    // 4. Chats referencing non-existent books
    for (const chat of chats ?? []) {
      if (!bookIds.has(chat.book_id)) {
        issues.push({
          type: "orphaned_embedding",
          severity: "error",
          description: `Chat references deleted book`,
          resourceId: chat.id,
        });
      }
    }

    // 5. user_books referencing non-existent books
    const { data: userBooks } = await serviceSupabase
      .from("user_books")
      .select("id, book_id, user_id");

    for (const ub of userBooks ?? []) {
      if (!bookIds.has(ub.book_id)) {
        issues.push({
          type: "orphaned_user_book",
          severity: "error",
          description: `User-book link references deleted book`,
          resourceId: ub.id,
        });
      }
    }

    // 6. Books missing storage files
    for (const book of books) {
      if (!book.storage_path) {
        issues.push({
          type: "missing_storage",
          severity: "warning",
          description: `Book "${book.title}" has no storage_path`,
          resourceId: book.id,
          resourceName: book.title,
        });
      }
    }

    // Sort by severity (errors first) then type
    issues.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
      return a.type.localeCompare(b.type);
    });

    return NextResponse.json({
      issues,
      summary: {
        total: issues.length,
        errors: issues.filter((i) => i.severity === "error").length,
        warnings: issues.filter((i) => i.severity === "warning").length,
      },
    });
  } catch (err) {
    console.error("[ADMIN] Health check error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
