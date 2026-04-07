import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !isAdminEmail(user.email)) {
    return null;
  }
  return user;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { collectionId } = await params;
    const serviceSupabase = createServiceClient();

    const { data, error } = await serviceSupabase
      .from("collection_demos")
      .select("id, question, tool_calls, answer, books, sort_order, created_at")
      .eq("curated_collection_id", collectionId)
      .order("sort_order");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ demos: data ?? [] });
  } catch (err) {
    console.error("[ADMIN] List collection demos error:", err);
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
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { collectionId } = await params;
    const body = await request.json();
    const { question, toolCalls, answer, books, sortOrder } = body as {
      question?: string;
      toolCalls?: unknown;
      answer?: string;
      books?: unknown;
      sortOrder?: number;
    };

    if (!question?.trim() || !answer?.trim()) {
      return NextResponse.json({ error: "question and answer are required" }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();

    // Auto-calculate sort_order if not provided
    let finalSortOrder = sortOrder ?? 0;
    if (sortOrder == null) {
      const { data: last } = await serviceSupabase
        .from("collection_demos")
        .select("sort_order")
        .eq("curated_collection_id", collectionId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .single();
      finalSortOrder = (last?.sort_order ?? -1) + 1;
    }

    const { data, error } = await serviceSupabase
      .from("collection_demos")
      .insert({
        curated_collection_id: collectionId,
        question: question.trim(),
        tool_calls: toolCalls ?? [],
        answer: answer.trim(),
        books: books ?? {},
        sort_order: finalSortOrder,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id });
  } catch (err) {
    console.error("[ADMIN] Create collection demo error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ collectionId: string }> }
) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { collectionId } = await params;
    const body = await request.json();
    const { id, question, toolCalls, answer, books, sortOrder } = body as {
      id?: string;
      question?: string;
      toolCalls?: unknown;
      answer?: string;
      books?: unknown;
      sortOrder?: number;
    };

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (question !== undefined) updates.question = question.trim();
    if (toolCalls !== undefined) updates.tool_calls = toolCalls;
    if (answer !== undefined) updates.answer = answer.trim();
    if (books !== undefined) updates.books = books;
    if (sortOrder !== undefined) updates.sort_order = sortOrder;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();
    const { error } = await serviceSupabase
      .from("collection_demos")
      .update(updates)
      .eq("id", id)
      .eq("curated_collection_id", collectionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ADMIN] Update collection demo error:", err);
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
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { collectionId } = await params;
    const body = await request.json();
    const { id } = body as { id?: string };

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();
    const { error } = await serviceSupabase
      .from("collection_demos")
      .delete()
      .eq("id", id)
      .eq("curated_collection_id", collectionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ADMIN] Delete collection demo error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
