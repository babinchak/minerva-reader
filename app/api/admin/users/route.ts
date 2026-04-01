import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextResponse } from "next/server";

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

    // Get all users from auth.users via admin API
    const { data: { users: authUsers }, error: usersError } =
      await serviceSupabase.auth.admin.listUsers({ perPage: 1000 });

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    // Get book counts per user
    const { data: bookCounts } = await serviceSupabase
      .from("user_books")
      .select("user_id");

    // Get chat counts per user
    const { data: chatCounts } = await serviceSupabase
      .from("chats")
      .select("user_id");

    // Get last activity per user (most recent user_books.last_opened_at)
    const { data: lastActivity } = await serviceSupabase
      .from("user_books")
      .select("user_id, last_opened_at")
      .not("last_opened_at", "is", null)
      .order("last_opened_at", { ascending: false });

    // Get billing data per user
    const { data: userCredits } = await serviceSupabase
      .from("user_credits")
      .select("user_id, tier, allowance_dollars, allowance_reset_at");

    // Aggregate counts
    const bookCountMap = new Map<string, number>();
    for (const row of bookCounts ?? []) {
      bookCountMap.set(row.user_id, (bookCountMap.get(row.user_id) ?? 0) + 1);
    }

    const chatCountMap = new Map<string, number>();
    for (const row of chatCounts ?? []) {
      chatCountMap.set(row.user_id, (chatCountMap.get(row.user_id) ?? 0) + 1);
    }

    // Last activity: first occurrence per user (already sorted desc)
    const lastActivityMap = new Map<string, string>();
    for (const row of lastActivity ?? []) {
      if (!lastActivityMap.has(row.user_id)) {
        lastActivityMap.set(row.user_id, row.last_opened_at);
      }
    }

    // Billing data map
    const creditsMap = new Map<string, { tier: string; allowanceDollars: number; allowanceResetAt: string | null }>();
    for (const row of userCredits ?? []) {
      creditsMap.set(row.user_id, {
        tier: row.tier ?? "free",
        allowanceDollars: row.allowance_dollars ?? 0,
        allowanceResetAt: row.allowance_reset_at ?? null,
      });
    }

    const users = (authUsers ?? []).map((u) => {
      const credits = creditsMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        lastActiveAt: lastActivityMap.get(u.id) ?? null,
        bookCount: bookCountMap.get(u.id) ?? 0,
        chatCount: chatCountMap.get(u.id) ?? 0,
        tier: credits?.tier ?? "free",
        allowanceDollars: credits?.allowanceDollars ?? 0,
        allowanceResetAt: credits?.allowanceResetAt ?? null,
      };
    });

    return NextResponse.json({ users });
  } catch (err) {
    console.error("[ADMIN] List users error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
