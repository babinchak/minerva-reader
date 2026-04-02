import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextResponse } from "next/server";

type Issue = {
  type:
    | "orphaned_book"
    | "orphaned_embedding"
    | "orphaned_chat"
    | "orphaned_user_book"
    | "orphaned_summary"
    | "empty_chat"
    | "missing_storage"
    | "no_embeddings"
    | "no_summaries"
    | "inconsistent_embeddings"
    | "inconsistent_summaries";
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

    // Fetch core data in parallel
    // Books query uses relationship counts to avoid row-limit issues on child tables
    const [booksResult, chatsResult, userBooksResult] =
      await Promise.all([
        serviceSupabase
          .from("books")
          .select("id, title, storage_path, book_type, vectors_processed_at, summaries_processed_at, user_books(count), embedding_sections(count), summaries(count)"),
        serviceSupabase.from("chats").select("id, book_id, chat_messages(count)"),
        serviceSupabase.from("user_books").select("id, book_id, user_id"),
      ]);

    const books = booksResult.data ?? [];
    const bookIdList = books.map((b) => b.id);
    const bookIds = new Set(bookIdList);
    const chats = chatsResult.data ?? [];
    const userBooks = userBooksResult.data ?? [];

    // Orphan detection: embedding/summary rows referencing books that no longer exist
    const [orphanedEmbResult, orphanedSumResult] =
      await Promise.all([
        serviceSupabase
          .from("embedding_sections")
          .select("book_id")
          .not("book_id", "in", `(${bookIdList.length > 0 ? bookIdList.join(",") : "__none__"})`),
        serviceSupabase
          .from("summaries")
          .select("book_id")
          .not("book_id", "in", `(${bookIdList.length > 0 ? bookIdList.join(",") : "__none__"})`),
      ]);

    // 1. Orphaned books (0 users)
    for (const book of books) {
      const userCount = (book as any).user_books?.[0]?.count ?? 0;
      if (userCount === 0) {
        issues.push({
          type: "orphaned_book",
          severity: "warning",
          description: `"${book.title}" has no users linked`,
          resourceId: book.id,
          resourceName: book.title,
        });
      }
    }

    // 2. Orphaned embedding sections (reference deleted books)
    const orphanedEmbeddingBookIds = new Set(
      (orphanedEmbResult.data ?? []).map((s) => s.book_id)
    );
    for (const orphanedBookId of orphanedEmbeddingBookIds) {
      issues.push({
        type: "orphaned_embedding",
        severity: "error",
        description: `Embedding sections reference deleted book`,
        resourceId: orphanedBookId,
      });
    }

    // 3. Empty chats (no messages)
    for (const chat of chats) {
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

    // 4. Orphaned chats (reference deleted books)
    for (const chat of chats) {
      if (!bookIds.has(chat.book_id)) {
        issues.push({
          type: "orphaned_chat",
          severity: "error",
          description: `Chat references deleted book`,
          resourceId: chat.id,
        });
      }
    }

    // 5. Orphaned user_books (reference deleted books)
    for (const ub of userBooks) {
      if (!bookIds.has(ub.book_id)) {
        issues.push({
          type: "orphaned_user_book",
          severity: "error",
          description: `User-book link references deleted book`,
          resourceId: ub.id,
        });
      }
    }

    // 6. Orphaned summaries (reference deleted books)
    const orphanedSummaryBookIds = new Set(
      (orphanedSumResult.data ?? []).map((s) => s.book_id)
    );
    for (const orphanedBookId of orphanedSummaryBookIds) {
      issues.push({
        type: "orphaned_summary",
        severity: "error",
        description: `Summaries reference deleted book`,
        resourceId: orphanedBookId,
      });
    }

    // 7. Books missing storage_path
    for (const book of books) {
      if (!book.storage_path) {
        issues.push({
          type: "missing_storage",
          severity: "warning",
          description: `"${book.title}" has no storage_path`,
          resourceId: book.id,
          resourceName: book.title,
        });
      }
    }

    // 8. Books not yet processed (based on timestamp columns)
    for (const book of books) {
      if (!book.vectors_processed_at) {
        issues.push({
          type: "no_embeddings",
          severity: "warning",
          description: `"${book.title}"`,
          resourceId: book.id,
          resourceName: book.title,
        });
      }
      if (!book.summaries_processed_at) {
        issues.push({
          type: "no_summaries",
          severity: "warning",
          description: `"${book.title}"`,
          resourceId: book.id,
          resourceName: book.title,
        });
      }
    }

    // 9. Data inconsistencies: timestamp says processed but no actual rows exist
    for (const book of books) {
      const embeddingCount = (book as any).embedding_sections?.[0]?.count ?? 0;
      const summaryCount = (book as any).summaries?.[0]?.count ?? 0;
      if (book.vectors_processed_at && embeddingCount === 0) {
        issues.push({
          type: "inconsistent_embeddings",
          severity: "error",
          description: `"${book.title}" marked as processed but has no embedding rows`,
          resourceId: book.id,
          resourceName: book.title,
        });
      }
      if (book.summaries_processed_at && summaryCount === 0) {
        issues.push({
          type: "inconsistent_summaries",
          severity: "error",
          description: `"${book.title}" marked as processed but has no summary rows`,
          resourceId: book.id,
          resourceName: book.title,
        });
      }
    }

    // Group issues by type
    const grouped: Record<string, Issue[]> = {};
    for (const issue of issues) {
      if (!grouped[issue.type]) grouped[issue.type] = [];
      grouped[issue.type].push(issue);
    }

    const totalErrors = issues.filter((i) => i.severity === "error").length;
    const totalWarnings = issues.filter((i) => i.severity === "warning").length;

    return NextResponse.json({
      groups: grouped,
      summary: {
        total: issues.length,
        errors: totalErrors,
        warnings: totalWarnings,
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
