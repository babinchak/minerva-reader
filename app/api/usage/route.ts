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
  costDollars: number;
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

    // Chat usage from usage_records
    const { data: chatUsageRows } = await serviceSupabase
      .from("usage_records")
      .select("id, cost_dollars, usage_type, model, input_tokens, output_tokens, reference_id, created_at")
      .eq("user_id", user.id)
      .in("usage_type", ["chat", "chat_agentic"])
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Resolve chat titles and book titles for display
    const chatIdsFromUsage = [...new Set((chatUsageRows ?? []).map((r) => r.reference_id).filter(Boolean))] as string[];
    const chatTitleMap = new Map<string, string>();
    const chatBookMap = new Map<string, string | undefined>();

    if (chatIdsFromUsage.length > 0) {
      const { data: chatsData } = await serviceSupabase
        .from("chats")
        .select("id, title, book_id")
        .in("id", chatIdsFromUsage);
      const chatBookIds = [...new Set((chatsData ?? []).map((c) => c.book_id).filter(Boolean))] as string[];
      const bookTitleMap = new Map<string, string>();
      if (chatBookIds.length > 0) {
        const { data: chatBooks } = await serviceSupabase
          .from("books")
          .select("id, title")
          .in("id", chatBookIds);
        for (const b of chatBooks ?? []) bookTitleMap.set(b.id, b.title ?? "");
        // Override with custom_title / file_name from user_books (same logic as library cards)
        const { data: chatUserBooks } = await serviceSupabase
          .from("user_books")
          .select("book_id, custom_title, file_name")
          .eq("user_id", user.id)
          .in("book_id", chatBookIds);
        for (const ub of chatUserBooks ?? []) {
          const display = ub.custom_title || bookTitleMap.get(ub.book_id) || ub.file_name || "Book";
          bookTitleMap.set(ub.book_id, display);
        }
      }
      for (const c of chatsData ?? []) {
        chatTitleMap.set(c.id, c.title ?? "Chat");
        chatBookMap.set(c.id, c.book_id ? bookTitleMap.get(c.book_id) : undefined);
      }
    }

    const chatRecords: UsageRecordDisplay[] = (chatUsageRows ?? []).map((r) => {
      const tokens = (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
      return {
        id: r.id,
        date: r.created_at,
        usageType: "chat" as const,
        model: r.model ?? undefined,
        inputTokens: r.input_tokens ?? undefined,
        outputTokens: r.output_tokens ?? undefined,
        tokens: tokens > 0 ? tokens : undefined,
        costDollars: r.cost_dollars ?? 0,
        referenceId: r.reference_id ?? undefined,
        title: r.reference_id ? chatTitleMap.get(r.reference_id) ?? "Deleted chat" : undefined,
        bookTitle: r.reference_id ? chatBookMap.get(r.reference_id) : undefined,
        chatMode: r.usage_type === "chat_agentic" ? "agentic" : "fast",
      };
    });

    // Upload/processing usage from usage_records
    const { data: uploadUsageRows } = await serviceSupabase
      .from("usage_records")
      .select("id, cost_dollars, usage_type, model, reference_id, created_at")
      .eq("user_id", user.id)
      .in("usage_type", ["upload", "summary_book", "summary_chapter", "embedding"])
      .order("created_at", { ascending: false })
      .limit(200);

    // Aggregate per-step records into per-book totals
    const uploadByBook = new Map<string, { costDollars: number; date: string }>();
    for (const r of uploadUsageRows ?? []) {
      const bookId = r.reference_id ?? r.id;
      const costDollars = r.cost_dollars ?? 0;
      const existing = uploadByBook.get(bookId);
      if (existing) {
        existing.costDollars += costDollars;
        if (r.created_at > existing.date) existing.date = r.created_at;
      } else {
        uploadByBook.set(bookId, { costDollars, date: r.created_at });
      }
    }

    const bookIds = Array.from(uploadByBook.keys());
    const bookMap = new Map<string, string>();
    if (bookIds.length > 0) {
      const { data: uploadBooks } = await serviceSupabase
        .from("books")
        .select("id, title")
        .in("id", bookIds);
      for (const b of uploadBooks ?? []) bookMap.set(b.id, b.title ?? "");
      // Override with custom_title / file_name from user_books (same logic as library cards)
      const { data: userBooks } = await serviceSupabase
        .from("user_books")
        .select("book_id, custom_title, file_name")
        .eq("user_id", user.id)
        .in("book_id", bookIds);
      for (const ub of userBooks ?? []) {
        const display = ub.custom_title ?? bookMap.get(ub.book_id) ?? ub.file_name ?? "Book";
        bookMap.set(ub.book_id, display);
      }
    }

    const mergedUploads: UsageRecordDisplay[] = Array.from(uploadByBook.entries()).map(
      ([bookId, { costDollars, date }]) => ({
        id: `upload-${bookId}`,
        date,
        usageType: "upload" as const,
        costDollars,
        referenceId: bookId,
        title: bookMap.get(bookId) || "Book upload",
      })
    );

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
