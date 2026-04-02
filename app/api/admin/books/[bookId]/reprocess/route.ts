import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/admin/books/[bookId]/reprocess
 *
 * Re-triggers the readium-processor-lambda via the triggerBookProcessing
 * Supabase Edge Function. Used to retry processing for books that got
 * stuck (e.g. due to Lambda concurrency limits).
 *
 * The processor Lambda is idempotent — if a manifest already exists,
 * it returns the cached result without reprocessing.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const supabase = await createClient();
    const serviceSupabase = createServiceClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { bookId } = await params;

    const { data: book, error: bookError } = await serviceSupabase
      .from("books")
      .select("id, title, book_type")
      .eq("id", bookId)
      .single();

    if (bookError || !book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    if (book.book_type !== "epub") {
      return NextResponse.json(
        { error: "Only EPUB books need readium processing" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Supabase configuration missing" },
        { status: 500 }
      );
    }

    // Call the edge function with the same payload shape as the DB webhook.
    // Use apikey header for Supabase gateway auth so that Authorization can carry
    // the webhook secret (the edge function checks Authorization: Bearer first).
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/triggerBookProcessing`;
    const resp = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        ...(webhookSecret
          ? { Authorization: `Bearer ${webhookSecret}` }
          : { Authorization: `Bearer ${serviceKey}` }),
      },
      body: JSON.stringify({
        type: "INSERT",
        schema: "public",
        table: "books",
        record: { id: bookId, book_type: "epub" },
      }),
    });

    const respText = await resp.text();
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(respText) as Record<string, unknown>;
    } catch {
      result = { raw: respText };
    }

    if (!resp.ok) {
      return NextResponse.json(
        { error: "Edge function invocation failed", status: resp.status, details: result },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      bookId,
      result,
    });
  } catch (err) {
    console.error("[ADMIN] Reprocess error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
