import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type UsageRow = {
  cost_dollars: number;
  usage_type: string;
  user_id: string | null;
};

/** Chat types vs book/upload types */
const CHAT_TYPES = new Set(["chat", "chat_agentic"]);

function categorize(usageType: string): "chat" | "books" {
  return CHAT_TYPES.has(usageType) ? "chat" : "books";
}

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

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      usageTodayResult,
      usageWeekResult,
      usageMonthResult,
      userCreditsResult,
    ] = await Promise.all([
      serviceSupabase
        .from("usage_records")
        .select("cost_dollars, usage_type, user_id")
        .gte("created_at", todayStart.toISOString()),

      serviceSupabase
        .from("usage_records")
        .select("cost_dollars, usage_type, user_id")
        .gte("created_at", weekAgo.toISOString()),

      serviceSupabase
        .from("usage_records")
        .select("cost_dollars, usage_type, user_id")
        .gte("created_at", monthAgo.toISOString()),

      serviceSupabase
        .from("user_credits")
        .select("user_id, tier, allowance_dollars, allowance_reset_at, on_demand_limit_type"),
    ]);

    // Build tier lookup from user_credits
    const tierMap = new Map<string, string>();
    for (const c of userCreditsResult.data ?? []) {
      tierMap.set(c.user_id, c.tier ?? "free");
    }

    function getTier(userId: string | null): "anonymous" | "free" | "paid" {
      if (!userId) return "anonymous";
      return (tierMap.get(userId) as "free" | "paid") ?? "free";
    }

    function aggregateUsage(rows: UsageRow[] | null) {
      const data = rows ?? [];
      let totalDollars = 0;
      const byType: Record<string, { count: number; totalDollars: number }> = {};

      const byTierCategory: Record<string, Record<string, { count: number; totalDollars: number }>> = {
        anonymous: { chat: { count: 0, totalDollars: 0 }, books: { count: 0, totalDollars: 0 } },
        free: { chat: { count: 0, totalDollars: 0 }, books: { count: 0, totalDollars: 0 } },
        paid: { chat: { count: 0, totalDollars: 0 }, books: { count: 0, totalDollars: 0 } },
      };

      for (const r of data) {
        totalDollars += r.cost_dollars;

        if (!byType[r.usage_type]) byType[r.usage_type] = { count: 0, totalDollars: 0 };
        byType[r.usage_type].count++;
        byType[r.usage_type].totalDollars += r.cost_dollars;

        const tier = getTier(r.user_id);
        const cat = categorize(r.usage_type);
        byTierCategory[tier][cat].count += 1;
        byTierCategory[tier][cat].totalDollars += r.cost_dollars;
      }

      return { totalDollars, requests: data.length, byType, byTierCategory };
    }

    const usageToday = aggregateUsage(usageTodayResult.data as UsageRow[] | null);
    const usageWeek = aggregateUsage(usageWeekResult.data as UsageRow[] | null);
    const usageMonth = aggregateUsage(usageMonthResult.data as UsageRow[] | null);

    const credits = userCreditsResult.data ?? [];
    let freeUsers = 0;
    let paidUsers = 0;
    let totalAllowanceDollarsFree = 0;
    let totalAllowanceDollarsPaid = 0;

    for (const c of credits) {
      if (c.tier === "paid") {
        paidUsers++;
        totalAllowanceDollarsPaid += c.allowance_dollars ?? 0;
      } else {
        freeUsers++;
        totalAllowanceDollarsFree += c.allowance_dollars ?? 0;
      }
    }

    return NextResponse.json({
      usage: {
        today: usageToday,
        week: usageWeek,
        month: usageMonth,
      },
      tiers: {
        free: { count: freeUsers, totalAllowanceDollars: totalAllowanceDollarsFree },
        paid: { count: paidUsers, totalAllowanceDollars: totalAllowanceDollarsPaid },
      },
      users: credits.map((c) => ({
        userId: c.user_id,
        tier: c.tier,
        allowanceDollars: c.allowance_dollars ?? 0,
        allowanceResetAt: c.allowance_reset_at,
        onDemandLimitType: c.on_demand_limit_type ?? "disabled",
      })),
    });
  } catch (err) {
    console.error("[ADMIN] Billing error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
