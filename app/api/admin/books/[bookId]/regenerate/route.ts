import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/admin/books/[bookId]/regenerate
 * Body: { action: "summaries" | "vectors", force?: boolean }
 *
 * Triggers the readium-summaries-lambda via its API Gateway endpoint
 * to regenerate summaries and/or vectors for a specific book.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
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

    const { bookId } = await params;

    // Validate book exists and get type
    const { data: book, error: bookError } = await serviceSupabase
      .from("books")
      .select("id, title, book_type")
      .eq("id", bookId)
      .single();

    if (bookError || !book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const body = (await request.json()) as { action?: string; force?: boolean };
    const action = body.action;
    const force = body.force ?? false;

    if (!action || !["summaries", "vectors"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'summaries' or 'vectors'." },
        { status: 400 }
      );
    }

    const isPdf = book.book_type === "pdf";
    const apiUrl = isPdf ? process.env.PDF_SUMMARIES_API_URL : process.env.SUMMARIES_API_URL;
    if (!apiUrl) {
      return NextResponse.json(
        { error: `${isPdf ? "PDF_SUMMARIES_API_URL" : "SUMMARIES_API_URL"} not configured` },
        { status: 500 }
      );
    }

    let url: URL;
    if (isPdf) {
      // PDF lambda uses path routing: base path for both, /summaries, /embeddings
      const path = action === "vectors" ? "/embeddings" : "/summaries";
      url = new URL(path, apiUrl);
      url.searchParams.set("book_id", bookId);
      if (force) url.searchParams.set("force", "true");
      if (force) url.searchParams.set("force_embeddings", "true");
    } else {
      // EPUB lambda uses query param routing: ?action=summaries|vectors
      url = new URL(apiUrl);
      url.searchParams.set("book_id", bookId);
      url.searchParams.set("action", action);
      if (force) url.searchParams.set("force", "true");
    }

    const lambdaResp = await fetch(url.toString(), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const lambdaBody = await lambdaResp.text();
    let lambdaResult: Record<string, unknown>;
    try {
      lambdaResult = JSON.parse(lambdaBody) as Record<string, unknown>;
    } catch {
      lambdaResult = { raw: lambdaBody };
    }

    if (!lambdaResp.ok) {
      return NextResponse.json(
        { error: "Lambda invocation failed", status: lambdaResp.status, details: lambdaResult },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      bookId,
      action,
      result: lambdaResult,
    });
  } catch (err) {
    console.error("[ADMIN] Regenerate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
