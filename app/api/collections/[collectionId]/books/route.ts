import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

/** GET /api/collections/[collectionId]/books — list book IDs in a collection. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  try {
    const { collectionId } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceSupabase = createServiceClient();

    // Verify ownership
    const { data: collection } = await serviceSupabase
      .from("collections")
      .select("id")
      .eq("id", collectionId)
      .eq("user_id", user.id)
      .single();

    if (!collection) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const { data: rows, error } = await serviceSupabase
      .from("collection_books")
      .select("book_id")
      .eq("collection_id", collectionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ bookIds: (rows ?? []).map((r) => r.book_id) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch collection books" },
      { status: 500 }
    );
  }
}

/** POST /api/collections/[collectionId]/books — add a book to a collection. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  try {
    const { collectionId } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { bookId?: string; bookIds?: string[] };
    const bookIds = body.bookIds ?? (body.bookId ? [body.bookId] : []);
    if (bookIds.length === 0) {
      return NextResponse.json({ error: "bookId or bookIds is required" }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();

    // Verify ownership of collection
    const { data: collection } = await serviceSupabase
      .from("collections")
      .select("id")
      .eq("id", collectionId)
      .eq("user_id", user.id)
      .single();

    if (!collection) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    // Verify user owns the books
    const { data: userBooks } = await serviceSupabase
      .from("user_books")
      .select("book_id")
      .eq("user_id", user.id)
      .in("book_id", bookIds);

    const ownedBookIds = new Set((userBooks ?? []).map((r) => r.book_id));
    const validBookIds = bookIds.filter((id) => ownedBookIds.has(id));

    if (validBookIds.length === 0) {
      return NextResponse.json({ error: "No valid books to add" }, { status: 400 });
    }

    const { error } = await serviceSupabase
      .from("collection_books")
      .upsert(
        validBookIds.map((bookId) => ({ collection_id: collectionId, book_id: bookId })),
        { onConflict: "collection_id,book_id" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Touch collection updated_at
    await serviceSupabase
      .from("collections")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", collectionId);

    revalidatePath("/");
    return NextResponse.json({ ok: true, added: validBookIds.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add books" },
      { status: 500 }
    );
  }
}

/** DELETE /api/collections/[collectionId]/books — remove a book from a collection. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  try {
    const { collectionId } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { bookId?: string };
    if (!body.bookId) {
      return NextResponse.json({ error: "bookId is required" }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();

    // Verify ownership
    const { data: collection } = await serviceSupabase
      .from("collections")
      .select("id")
      .eq("id", collectionId)
      .eq("user_id", user.id)
      .single();

    if (!collection) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const { error } = await serviceSupabase
      .from("collection_books")
      .delete()
      .eq("collection_id", collectionId)
      .eq("book_id", body.bookId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidatePath("/");
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove book" },
      { status: 500 }
    );
  }
}
