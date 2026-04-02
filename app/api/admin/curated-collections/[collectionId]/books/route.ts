import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
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

    const { collectionId } = await params;

    const { data: rows, error } = await serviceSupabase
      .from("curated_collection_books")
      .select("book_id, sort_order, added_at, books(id, title, author, book_type, cover_path)")
      .eq("curated_collection_id", collectionId)
      .order("sort_order");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const books = (rows ?? []).map((r) => {
      const book = (r as any).books;
      return {
        bookId: r.book_id,
        sortOrder: r.sort_order,
        addedAt: r.added_at,
        title: book?.title ?? null,
        author: book?.author ?? null,
        bookType: book?.book_type ?? null,
        coverUrl:
          book?.cover_path && supabaseUrl
            ? `${supabaseUrl}/storage/v1/object/public/covers/${book.cover_path}`
            : null,
      };
    });

    return NextResponse.json({ books });
  } catch (err) {
    console.error("[ADMIN] List curated collection books error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
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

    const { collectionId } = await params;
    const body = await request.json();
    const { bookId, bookIds } = body as { bookId?: string; bookIds?: string[] };

    const ids = bookIds ?? (bookId ? [bookId] : []);
    if (ids.length === 0) {
      return NextResponse.json({ error: "bookId or bookIds required" }, { status: 400 });
    }

    // Get max sort_order in this collection
    const { data: maxRow } = await serviceSupabase
      .from("curated_collection_books")
      .select("sort_order")
      .eq("curated_collection_id", collectionId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();
    let nextOrder = (maxRow?.sort_order ?? -1) + 1;

    const rows = ids.map((id) => ({
      curated_collection_id: collectionId,
      book_id: id,
      sort_order: nextOrder++,
    }));

    const { error: insertError } = await serviceSupabase
      .from("curated_collection_books")
      .upsert(rows, { onConflict: "curated_collection_id,book_id", ignoreDuplicates: true });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Auto-set is_curated on added books
    await serviceSupabase
      .from("books")
      .update({ is_curated: true })
      .in("id", ids);

    return NextResponse.json({ success: true, added: ids.length });
  } catch (err) {
    console.error("[ADMIN] Add books to curated collection error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
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

    const { collectionId } = await params;
    const body = await request.json();
    const { bookId } = body as { bookId?: string };

    if (!bookId) {
      return NextResponse.json({ error: "bookId is required" }, { status: 400 });
    }

    const { error: deleteError } = await serviceSupabase
      .from("curated_collection_books")
      .delete()
      .eq("curated_collection_id", collectionId)
      .eq("book_id", bookId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Check if book is still in any curated collection; if not, unset is_curated
    const { count } = await serviceSupabase
      .from("curated_collection_books")
      .select("id", { count: "exact", head: true })
      .eq("book_id", bookId);

    if (count === 0) {
      await serviceSupabase
        .from("books")
        .update({ is_curated: false })
        .eq("id", bookId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ADMIN] Remove book from curated collection error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
