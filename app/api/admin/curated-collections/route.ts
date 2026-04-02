import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";

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

    const { data: collections, error } = await serviceSupabase
      .from("curated_collections")
      .select("id, name, description, slug, cover_image_path, sort_order, created_at, updated_at, curated_collection_books(count)")
      .order("sort_order");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const list = (collections ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      slug: c.slug,
      coverImagePath: c.cover_image_path,
      coverUrl:
        c.cover_image_path && supabaseUrl
          ? `${supabaseUrl}/storage/v1/object/public/covers/${c.cover_image_path}`
          : null,
      sortOrder: c.sort_order,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      bookCount: (c as any).curated_collection_books?.[0]?.count ?? 0,
    }));

    return NextResponse.json({ collections: list });
  } catch (err) {
    console.error("[ADMIN] List curated collections error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { name, description, slug, coverImagePath } = body as {
      name?: string;
      description?: string;
      slug?: string;
      coverImagePath?: string;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const finalSlug = slug?.trim() ? slugify(slug) : slugify(name);
    if (!finalSlug) {
      return NextResponse.json({ error: "Could not generate a valid slug" }, { status: 400 });
    }

    // Get max sort_order to append at end
    const { data: maxRow } = await serviceSupabase
      .from("curated_collections")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();
    const nextOrder = (maxRow?.sort_order ?? -1) + 1;

    const { data: created, error: insertError } = await serviceSupabase
      .from("curated_collections")
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        slug: finalSlug,
        cover_image_path: coverImagePath?.trim() || null,
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json({ error: "A collection with this slug already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ collection: created }, { status: 201 });
  } catch (err) {
    console.error("[ADMIN] Create curated collection error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
