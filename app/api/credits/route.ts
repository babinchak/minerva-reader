import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  getCredits,
  getTier,
  countBooksUploadedThisWeek,
  countAgenticRequestsToday,
} from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        tier: "anonymous",
        balance: 0,
        monthlyAllowance: 0,
        booksUploadedThisWeek: 0,
        agenticToday: 0,
        agenticLimit: 0,
      });
    }

    const tier = await getTier(user.id);
    const credits = await getCredits(user.id);
    const booksUploadedThisWeek =
      tier === "free" ? await countBooksUploadedThisWeek(user.id) : 0;
    const agenticToday = tier === "free" ? await countAgenticRequestsToday(user.id) : 0;
    const agenticLimit = tier === "free" ? 5 : 999999;

    return NextResponse.json(
      {
        tier,
        balance: credits?.balance ?? 0,
        monthlyAllowance: credits?.monthlyAllowance ?? 0,
        booksUploadedThisWeek,
        booksUploadLimit: tier === "free" ? 3 : 999999,
        agenticToday,
        agenticLimit,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  } catch (err) {
    console.error("Credits API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch credits" },
      { status: 500 }
    );
  }
}
