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

    const { data: books, error } = await serviceSupabase
      .from("books")
      .select("id, title, author, book_type, is_curated, created_at, last_opened_at, cover_path, user_books(count)")
      .order("title");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const list = (books ?? []).map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      bookType: b.book_type,
      isCurated: b.is_curated ?? false,
      createdAt: b.created_at,
      lastOpenedAt: (b as any).last_opened_at ?? null,
      coverUrl:
        b.cover_path && supabaseUrl
          ? `${supabaseUrl}/storage/v1/object/public/covers/${b.cover_path}`
          : null,
      userCount: (b as any).user_books?.[0]?.count ?? 0,
    }));

    return NextResponse.json({ books: list });
  } catch (err) {
    console.error("[ADMIN] List books error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
