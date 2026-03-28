import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

/** GET /api/collections — list all collections for the current user. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceSupabase = createServiceClient();
  const { data: collections, error } = await serviceSupabase
    .from("collections")
    .select("id, name, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get book counts for each collection
  const collectionIds = (collections ?? []).map((c) => c.id);
  let bookCounts: Record<string, number> = {};
  if (collectionIds.length > 0) {
    const { data: cbRows } = await serviceSupabase
      .from("collection_books")
      .select("collection_id")
      .in("collection_id", collectionIds);
    if (cbRows) {
      for (const row of cbRows) {
        bookCounts[row.collection_id] = (bookCounts[row.collection_id] ?? 0) + 1;
      }
    }
  }

  return NextResponse.json({
    collections: (collections ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      bookCount: bookCounts[c.id] ?? 0,
    })),
  });
}

/** POST /api/collections — create a new collection. */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { name?: string };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();
    const { data, error } = await serviceSupabase
      .from("collections")
      .insert({ user_id: user.id, name })
      .select("id, name")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    revalidatePath("/");
    return NextResponse.json({ collection: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create collection" },
      { status: 500 }
    );
  }
}
