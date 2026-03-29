import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
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

    // Get book info
    const { data: book, error: bookError } = await serviceSupabase
      .from("books")
      .select("id, title, author, book_type, is_curated, created_at, last_opened_at, storage_path, cover_path, file_name, file_checksum")
      .eq("id", bookId)
      .single();

    if (bookError || !book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Get users who have this book (email + when they added it + last opened)
    const { data: userBookRows } = await serviceSupabase
      .from("user_books")
      .select("user_id, created_at, last_opened_at")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false });

    // Resolve user emails
    const userIds = (userBookRows ?? []).map((ub) => ub.user_id);
    const { data: { users: authUsers } } = await serviceSupabase.auth.admin.listUsers({ perPage: 1000 });
    const emailMap = new Map<string, string>();
    for (const u of authUsers ?? []) {
      emailMap.set(u.id, u.email ?? "Unknown");
    }

    const users = (userBookRows ?? []).map((ub) => ({
      email: emailMap.get(ub.user_id) ?? "Unknown",
      addedAt: ub.created_at,
      lastOpenedAt: ub.last_opened_at,
    }));

    // Chat count for this book
    const { count: chatCount } = await serviceSupabase
      .from("chats")
      .select("id", { count: "exact" })
      .eq("book_id", bookId);

    // Embedding sections count
    const { count: embeddingCount } = await serviceSupabase
      .from("embedding_sections")
      .select("id", { count: "exact" })
      .eq("book_id", bookId);

    // Summary counts by type
    const { data: summaryRows } = await serviceSupabase
      .from("summaries")
      .select("summary_type")
      .eq("book_id", bookId);

    const summaryCounts: Record<string, number> = {};
    for (const s of summaryRows ?? []) {
      summaryCounts[s.summary_type] = (summaryCounts[s.summary_type] ?? 0) + 1;
    }

    // Processing events (most recent 20)
    const { data: processingEvents } = await serviceSupabase
      .from("processing_events")
      .select("id, action, status, error_message, lambda_name, log_group, log_stream, aws_region, duration_ms, metadata, created_at")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      book: {
        id: book.id,
        title: book.title,
        author: book.author,
        bookType: book.book_type,
        isCurated: book.is_curated,
        createdAt: book.created_at,
        lastOpenedAt: (book as any).last_opened_at ?? null,
        storagePath: book.storage_path,
        fileName: book.file_name,
      },
      users,
      chatCount: chatCount ?? 0,
      embeddingCount: embeddingCount ?? 0,
      summaryCounts,
      processingEvents: (processingEvents ?? []).map((e) => ({
        id: e.id,
        action: e.action,
        status: e.status,
        errorMessage: e.error_message,
        lambdaName: e.lambda_name,
        logGroup: e.log_group,
        logStream: e.log_stream,
        awsRegion: e.aws_region,
        durationMs: e.duration_ms,
        metadata: e.metadata,
        createdAt: e.created_at,
      })),
    });
  } catch (err) {
    console.error("[ADMIN] Book detail error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
