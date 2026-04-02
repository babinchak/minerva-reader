import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
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

    const allowedFields: Record<string, string> = {
      name: "name",
      description: "description",
      slug: "slug",
      coverImagePath: "cover_image_path",
      sortOrder: "sort_order",
    };

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      const col = allowedFields[key];
      if (col !== undefined) updates[col] = value;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { error: updateError } = await serviceSupabase
      .from("curated_collections")
      .update(updates)
      .eq("id", collectionId);

    if (updateError) {
      if (updateError.code === "23505") {
        return NextResponse.json({ error: "A collection with this slug already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ADMIN] Patch curated collection error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const { error: deleteError } = await serviceSupabase
      .from("curated_collections")
      .delete()
      .eq("id", collectionId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ADMIN] Delete curated collection error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
