import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File must be under 2MB" }, { status: 400 });
    }

    const filename = `${user.id}/avatar.webp`;

    // Delete old avatar if it exists
    await serviceSupabase.storage.from("avatars").remove([filename]);

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await serviceSupabase.storage
      .from("avatars")
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = serviceSupabase.storage
      .from("avatars")
      .getPublicUrl(filename);

    // Add cache-busting param so the browser picks up the new avatar
    const avatarUrl = `${publicUrl}?t=${Date.now()}`;

    // Update user metadata with the new avatar URL
    const { error: updateError } = await serviceSupabase.auth.admin.updateUserById(
      user.id,
      { user_metadata: { avatar_url: avatarUrl } },
    );

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ avatarUrl });
  } catch (err) {
    console.error("[PROFILE] Avatar upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
