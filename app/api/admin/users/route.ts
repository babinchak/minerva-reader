import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextRequest, NextResponse } from "next/server";
import { allowanceDollarsForTier, ALLOWANCE_DOLLARS_FREE_DAILY, ALLOWANCE_DOLLARS_PAID_MONTHLY } from "@/lib/credits";

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

    // Get books uploaded this week per user (for free tier upload limit)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data: recentBooks } = await serviceSupabase
      .from("books")
      .select("uploaded_by, created_at")
      .gte("created_at", weekAgo.toISOString());

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
      .select("user_id, tier, allowance_dollars, included_balance, extra_usage_balance, allowance_reset_at, on_demand_limit_type, on_demand_limit_dollars");

    // Aggregate counts
    const bookCountMap = new Map<string, number>();
    for (const row of bookCounts ?? []) {
      bookCountMap.set(row.user_id, (bookCountMap.get(row.user_id) ?? 0) + 1);
    }

    const chatCountMap = new Map<string, number>();
    for (const row of chatCounts ?? []) {
      chatCountMap.set(row.user_id, (chatCountMap.get(row.user_id) ?? 0) + 1);
    }

    const uploadsThisWeekMap = new Map<string, number>();
    for (const row of recentBooks ?? []) {
      if (row.uploaded_by) {
        uploadsThisWeekMap.set(row.uploaded_by, (uploadsThisWeekMap.get(row.uploaded_by) ?? 0) + 1);
      }
    }

    // Last activity: first occurrence per user (already sorted desc)
    const lastActivityMap = new Map<string, string>();
    for (const row of lastActivity ?? []) {
      if (!lastActivityMap.has(row.user_id)) {
        lastActivityMap.set(row.user_id, row.last_opened_at);
      }
    }

    // Billing data map
    const creditsMap = new Map<string, { tier: string; allowanceDollars: number; includedBalance: number; extraUsageBalance: number; allowanceResetAt: string | null; onDemandLimitType: string; onDemandLimitDollars: number }>();
    for (const row of userCredits ?? []) {
      creditsMap.set(row.user_id, {
        tier: row.tier ?? "free",
        allowanceDollars: row.allowance_dollars ?? 0,
        includedBalance: row.included_balance ?? 0,
        extraUsageBalance: row.extra_usage_balance ?? 0,
        allowanceResetAt: row.allowance_reset_at ?? null,
        onDemandLimitType: row.on_demand_limit_type ?? "disabled",
        onDemandLimitDollars: row.on_demand_limit_dollars ?? 10,
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
        includedBalance: credits?.includedBalance ?? 0,
        extraUsageBalance: credits?.extraUsageBalance ?? 0,
        allowanceResetAt: credits?.allowanceResetAt ?? null,
        onDemandLimitType: credits?.onDemandLimitType ?? "disabled",
        onDemandLimitDollars: credits?.onDemandLimitDollars ?? 10,
        uploadsThisWeek: uploadsThisWeekMap.get(u.id) ?? 0,
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

/**
 * Admin actions on a user's credits:
 * - action: "reset_to_free" — reset user to free tier with fresh daily allowance
 * - action: "set_paid" — set user to paid tier with fresh monthly allowance
 * - action: "reset_balance" — reset included_balance to their tier's allowance
 * - action: "add_extra" — add dollars to extra_usage_balance
 * - action: "set_extra" — set extra_usage_balance to a specific amount
 */
export async function PATCH(req: NextRequest) {
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

    const body = await req.json();
    const { userId, action, dollars } = body as { userId: string; action: string; dollars?: number };

    if (!userId || !action) {
      return NextResponse.json({ error: "userId and action required" }, { status: 400 });
    }

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    switch (action) {
      case "reset_to_free": {
        await serviceSupabase
          .from("user_credits")
          .upsert({
            user_id: userId,
            tier: "free",
            allowance_dollars: ALLOWANCE_DOLLARS_FREE_DAILY,
            included_balance: ALLOWANCE_DOLLARS_FREE_DAILY,
            stripe_subscription_id: null,
            stripe_customer_id: null,
            allowance_reset_at: tomorrow.toISOString(),
            updated_at: now.toISOString(),
          }, { onConflict: "user_id" });
        break;
      }
      case "set_paid": {
        await serviceSupabase
          .from("user_credits")
          .upsert({
            user_id: userId,
            tier: "paid",
            allowance_dollars: ALLOWANCE_DOLLARS_PAID_MONTHLY,
            included_balance: ALLOWANCE_DOLLARS_PAID_MONTHLY,
            allowance_reset_at: nextMonth.toISOString(),
            updated_at: now.toISOString(),
          }, { onConflict: "user_id" });
        break;
      }
      case "reset_balance": {
        const { data: existing } = await serviceSupabase
          .from("user_credits")
          .select("tier")
          .eq("user_id", userId)
          .single();
        const tier = (existing?.tier ?? "free") as "free" | "paid";
        const allowance = allowanceDollarsForTier(tier);
        await serviceSupabase
          .from("user_credits")
          .update({
            included_balance: allowance,
            updated_at: now.toISOString(),
          })
          .eq("user_id", userId);
        break;
      }
      case "add_extra": {
        const amount = dollars ?? 0;
        if (amount <= 0) return NextResponse.json({ error: "dollars must be > 0" }, { status: 400 });
        const { data: current } = await serviceSupabase
          .from("user_credits")
          .select("extra_usage_balance")
          .eq("user_id", userId)
          .single();
        await serviceSupabase
          .from("user_credits")
          .update({
            extra_usage_balance: (current?.extra_usage_balance ?? 0) + amount,
            updated_at: now.toISOString(),
          })
          .eq("user_id", userId);
        break;
      }
      case "set_extra": {
        const amount = dollars ?? 0;
        if (amount < 0) return NextResponse.json({ error: "dollars must be >= 0" }, { status: 400 });
        await serviceSupabase
          .from("user_credits")
          .update({
            extra_usage_balance: amount,
            updated_at: now.toISOString(),
          })
          .eq("user_id", userId);
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ADMIN] User action error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
