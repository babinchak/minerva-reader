import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { bookId } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use service client to bypass RLS - we've already verified the user is authenticated
    const serviceSupabase = createServiceClient();
    const { error } = await serviceSupabase
      .from("user_books")
      .delete()
      .eq("user_id", user.id)
      .eq("book_id", bookId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
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
