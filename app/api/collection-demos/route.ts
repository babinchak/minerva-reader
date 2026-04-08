import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/collection-demos — public endpoint returning shuffled demo cards.
 * Used by the landing page ResponseWall for continuous rotation.
 *
 * Query params:
 *   limit  – batch size (default 20, max 50)
 *   exclude – comma-separated demo IDs to exclude (avoids immediate repeats)
 *   collection – optional collection slug filter
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(sp.get("limit") ?? "20", 10) || 20, 50);
  const excludeRaw = sp.get("exclude") ?? "";
  const excludeIds = excludeRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const collectionSlug = sp.get("collection") ?? null;

  const supabase = createServiceClient();

  // Build query: demos joined with parent collection info
  let query = supabase
    .from("collection_demos")
    .select(
      "id, question, tool_calls, answer, books, curated_collections!inner(name, slug)"
    );

  if (collectionSlug) {
    query = query.eq("curated_collections.slug", collectionSlug);
  }

  if (excludeIds.length > 0) {
    // Supabase doesn't have a "not in" for arrays easily, use filter
    for (const id of excludeIds) {
      query = query.neq("id", id);
    }
  }

  // When showing "All" (no collection filter), over-fetch so the random
  // shuffle picks from a wider pool, giving better variety across collections.
  const fetchLimit = collectionSlug ? limit : Math.min(limit * 4, 200);
  query = query.limit(fetchLimit);

  const { data, error } = await query;

  if (error) {
    console.error("[collection-demos] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Shuffle server-side so each batch is in a different order
  let rows = data ?? [];
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  // Trim back to requested limit after shuffling
  rows = rows.slice(0, limit);

  const demos = rows.map((d: any) => ({
    id: d.id as string,
    question: d.question as string,
    toolCalls: (d.tool_calls ?? []) as {
      toolName: string;
      args: Record<string, unknown>;
    }[],
    answer: d.answer as string,
    books: (d.books ?? {}) as Record<
      string,
      { bookId: string; bookLabel: string; bookType: string | null }
    >,
    collectionName: d.curated_collections?.name ?? "",
    collectionSlug: d.curated_collections?.slug ?? "",
  }));

  return NextResponse.json({ demos });
}
