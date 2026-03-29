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

    // Recent books (last 20 added)
    const { data: recentBooks } = await serviceSupabase
      .from("books")
      .select("id, title, author, book_type, created_at, cover_path, user_books(count)")
      .order("created_at", { ascending: false })
      .limit(20);

    // Recent user signups (last 20)
    const { data: { users: authUsers } } =
      await serviceSupabase.auth.admin.listUsers({ perPage: 1000 });

    const recentUsers = (authUsers ?? [])
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20)
      .map((u) => ({
        id: u.id,
        email: u.email ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
      }));

    // Recent chats (last 20)
    const { data: recentChats } = await serviceSupabase
      .from("chats")
      .select("id, book_id, user_id, created_at, title, books(title)")
      .order("created_at", { ascending: false })
      .limit(20);

    // Books processing status: books missing embeddings or summaries
    const { data: allBooks } = await serviceSupabase
      .from("books")
      .select("id, title, book_type, created_at");

    const bookIds = (allBooks ?? []).map((b) => b.id);

    const [embResult, sumResult] = await Promise.all([
      serviceSupabase
        .from("embedding_sections")
        .select("book_id")
        .in("book_id", bookIds.length > 0 ? bookIds : ["__none__"]),
      serviceSupabase
        .from("summaries")
        .select("book_id")
        .in("book_id", bookIds.length > 0 ? bookIds : ["__none__"]),
    ]);

    const booksWithEmbeddings = new Set((embResult.data ?? []).map((r) => r.book_id));
    const booksWithSummaries = new Set((sumResult.data ?? []).map((r) => r.book_id));

    const processingStatus = (allBooks ?? []).map((b) => ({
      id: b.id,
      title: b.title,
      bookType: b.book_type,
      createdAt: b.created_at,
      hasEmbeddings: booksWithEmbeddings.has(b.id),
      hasSummaries: booksWithSummaries.has(b.id),
    }));

    // Only return books that are missing something
    const needsAttention = processingStatus.filter(
      (b) => !b.hasEmbeddings || !b.hasSummaries
    );

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const books = (recentBooks ?? []).map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      bookType: b.book_type,
      createdAt: b.created_at,
      coverUrl:
        b.cover_path && supabaseUrl
          ? `${supabaseUrl}/storage/v1/object/public/covers/${b.cover_path}`
          : null,
      userCount: (b as any).user_books?.[0]?.count ?? 0,
    }));

    return NextResponse.json({
      recentBooks: books,
      recentUsers,
      recentChats: (recentChats ?? []).map((c) => ({
        id: c.id,
        bookId: c.book_id,
        userId: c.user_id,
        createdAt: c.created_at,
        title: c.title,
        bookTitle: (c as any).books?.title ?? null,
      })),
      needsAttention,
    });
  } catch (err) {
    console.error("[ADMIN] Activity error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
