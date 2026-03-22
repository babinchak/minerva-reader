import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextResponse } from "next/server";

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

    // Run all queries in parallel
    const [
      usersResult,
      booksResult,
      chatsResult,
      embeddingsResult,
      userBooksResult,
      summariesResult,
    ] = await Promise.all([
      serviceSupabase.auth.admin.listUsers({ perPage: 1 }),
      serviceSupabase.from("books").select("id, user_books(count), book_type, is_curated", { count: "exact" }),
      serviceSupabase.from("chats").select("id", { count: "exact" }),
      serviceSupabase.from("embedding_sections").select("id", { count: "exact" }),
      serviceSupabase.from("user_books").select("id", { count: "exact" }),
      serviceSupabase.from("summaries").select("id", { count: "exact" }),
    ]);

    // Total users - use the total from pagination
    // listUsers with perPage:1 still gives us .users but we need total count
    const { data: allUsersData } = await serviceSupabase.auth.admin.listUsers({ perPage: 1000 });
    const totalUsers = allUsersData?.users?.length ?? 0;

    const totalBooks = booksResult.count ?? 0;
    const totalChats = chatsResult.count ?? 0;
    const totalEmbeddings = embeddingsResult.count ?? 0;
    const totalUserBooks = userBooksResult.count ?? 0;
    const totalSummaries = summariesResult.count ?? 0;

    // Books with 0 users (orphaned)
    const books = booksResult.data ?? [];
    const orphanedBooks = books.filter(
      (b) => ((b as any).user_books?.[0]?.count ?? 0) === 0
    );

    // Books with no embeddings
    const bookIds = books.map((b) => b.id);
    const { data: embeddedBookRows } = await serviceSupabase
      .from("embedding_sections")
      .select("book_id")
      .in("book_id", bookIds.length > 0 ? bookIds : ["__none__"]);

    const embeddedBookIds = new Set((embeddedBookRows ?? []).map((r) => r.book_id));
    const booksWithoutEmbeddings = books.filter((b) => !embeddedBookIds.has(b.id));

    // Book type breakdown
    const epubCount = books.filter((b) => b.book_type === "epub").length;
    const pdfCount = books.filter((b) => b.book_type === "pdf").length;
    const curatedCount = books.filter((b) => b.is_curated).length;

    return NextResponse.json({
      stats: {
        totalUsers,
        totalBooks,
        totalChats,
        totalEmbeddings,
        totalUserBooks,
        totalSummaries,
        orphanedBookCount: orphanedBooks.length,
        orphanedBooks: orphanedBooks.map((b) => ({ id: b.id })),
        booksWithoutEmbeddingsCount: booksWithoutEmbeddings.length,
        booksWithoutEmbeddings: booksWithoutEmbeddings.map((b) => ({ id: b.id })),
        epubCount,
        pdfCount,
        curatedCount,
      },
    });
  } catch (err) {
    console.error("[ADMIN] Stats error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
