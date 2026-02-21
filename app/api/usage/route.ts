import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface UsageRecordDisplay {
  id: string;
  date: string;
  usageType: "chat" | "upload";
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  tokens?: number;
  included: boolean;
  costCents?: number;
  referenceId?: string;
  /** For chat: chat title. For upload: book title */
  title?: string;
  /** For chat: book context (e.g. "Book Title" or "General") */
  bookTitle?: string;
  /** For chat: "fast" | "agentic" */
  chatMode?: string;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));

    const serviceSupabase = createServiceClient();

    // Get user's chats with book info
    const { data: userChats } = await serviceSupabase
      .from("chats")
      .select("id, title, book_id")
      .eq("user_id", user.id);
    const chatIds = (userChats ?? []).map((c) => c.id);
    const chatTitleMap = new Map((userChats ?? []).map((c) => [c.id, c.title ?? "Chat"]));
    const chatBookIds = [...new Set((userChats ?? []).map((c) => c.book_id).filter(Boolean))] as string[];

    const bookTitleMap = new Map<string, string>();
    if (chatBookIds.length > 0) {
      const { data: chatBooks } = await serviceSupabase
        .from("books")
        .select("id, title")
        .in("id", chatBookIds);
      for (const b of chatBooks ?? []) {
        bookTitleMap.set(b.id, b.title ?? "Book");
      }
    }
    const chatBookMap = new Map((userChats ?? []).map((c) => [c.id, c.book_id ? bookTitleMap.get(c.book_id) : undefined]));

    const chatRecords: UsageRecordDisplay[] = [];

    if (chatIds.length > 0) {
      const { data: chatMessages, error: chatError } = await serviceSupabase
        .from("chat_messages")
        .select("id, chat_id, cost_cents, input_tokens, output_tokens, model, usage_included, chat_mode, created_at")
        .eq("role", "assistant")
        .in("chat_id", chatIds)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (!chatError && chatMessages) {
        for (const m of chatMessages) {
          const tokens = (m.input_tokens ?? 0) + (m.output_tokens ?? 0);
          chatRecords.push({
            id: m.id,
            date: m.created_at,
            usageType: "chat",
            model: m.model ?? undefined,
            inputTokens: m.input_tokens ?? undefined,
            outputTokens: m.output_tokens ?? undefined,
            tokens: tokens > 0 ? tokens : undefined,
            included: m.usage_included ?? true,
            costCents: m.usage_included ? undefined : (m.cost_cents ?? undefined),
            referenceId: m.chat_id,
            title: chatTitleMap.get(m.chat_id),
            bookTitle: chatBookMap.get(m.chat_id),
            chatMode: m.chat_mode ?? undefined,
          });
        }
      }
    }

    // Books: user's uploads with processing cost (backend sets these)
    const { data: books, error: booksError } = await serviceSupabase
      .from("books")
      .select("id, title, processing_cost_cents, processing_cost_included, created_at")
      .eq("uploaded_by", user.id)
      .not("processing_cost_cents", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (booksError) {
      console.error("Usage API books error:", booksError);
    }

    const uploadRecords: UsageRecordDisplay[] = (books ?? []).map((b) => ({
      id: `upload-${b.id}`,
      date: b.created_at,
      usageType: "upload" as const,
      included: b.processing_cost_included ?? true,
      costCents: b.processing_cost_included ? undefined : (b.processing_cost_cents ?? undefined),
      referenceId: b.id,
      title: b.title ?? "Book upload",
    }));

    // Also include usage_records for upload/summary/embedding (legacy/backend)
    const { data: legacyRecords } = await serviceSupabase
      .from("usage_records")
      .select("id, cost_cents, usage_type, model, reference_id, included, created_at")
      .eq("user_id", user.id)
      .in("usage_type", ["upload", "summary_book", "summary_chapter", "embedding"])
      .order("created_at", { ascending: false })
      .limit(50);

    const uploadByBook = new Map<string, { costCents: number; included: boolean; date: string }>();
    for (const r of legacyRecords ?? []) {
      const bookId = r.reference_id ?? r.id;
      const costCents = r.cost_cents ?? 0;
      const included = r.included ?? true;
      const existing = uploadByBook.get(bookId);
      if (existing) {
        existing.costCents += costCents;
        existing.included = existing.included && included;
        if (r.created_at > existing.date) existing.date = r.created_at;
      } else {
        uploadByBook.set(bookId, { costCents, included, date: r.created_at });
      }
    }

    const { data: legacyBooks } =
      uploadByBook.size > 0
        ? await serviceSupabase.from("books").select("id, title").in("id", Array.from(uploadByBook.keys()))
        : { data: [] };
    const bookMap = new Map((legacyBooks ?? []).map((b) => [b.id, b.title ?? "Book"]));

    const legacyUploadRecords: UsageRecordDisplay[] = Array.from(uploadByBook.entries()).map(
      ([bookId, { costCents, included, date }]) => ({
        id: `upload-legacy-${bookId}`,
        date,
        usageType: "upload" as const,
        included,
        costCents: included ? undefined : costCents,
        referenceId: bookId,
        title: bookMap.get(bookId) ?? "Book upload",
      })
    );

    const allUploads = [...uploadRecords, ...legacyUploadRecords];
    const uploadById = new Map(allUploads.map((u) => [u.referenceId ?? u.id, u]));
    const mergedUploads = Array.from(uploadById.values());

    const display: UsageRecordDisplay[] = [...chatRecords, ...mergedUploads].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return NextResponse.json({ records: display });
  } catch (err) {
    console.error("Usage API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch usage" },
      { status: 500 }
    );
  }
}
