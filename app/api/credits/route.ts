import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  getCredits,
  getTier,
  countBooksUploadedThisWeek,
  countAgenticRequestsToday,
  isFreeBetaMode,
} from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      const freeBeta = isFreeBetaMode();
      return NextResponse.json({
        tier: freeBeta ? "paid" : "anonymous",
        freeBetaMode: freeBeta,
        balanceCents: 0,
        allowanceCents: 0,
        booksUploadedThisWeek: 0,
        agenticToday: 0,
        agenticLimit: freeBeta ? 999999 : 0,
        allowanceResetAt: null,
        onDemandLimitType: "disabled",
        onDemandLimitCents: 1000,
        onDemandCentsThisPeriod: 0,
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
        freeBetaMode: isFreeBetaMode(),
        balanceCents: credits?.balanceCents ?? 0,
        allowanceCents: credits?.allowanceCents ?? 0,
        allowanceResetAt: credits?.allowanceResetAt?.toISOString() ?? null,
        booksUploadedThisWeek,
        booksUploadLimit: tier === "free" ? 3 : 999999,
        agenticToday,
        agenticLimit,
        onDemandLimitType: credits?.onDemandLimitType ?? "disabled",
        onDemandLimitCents: credits?.onDemandLimitCents ?? 1000,
        onDemandCentsThisPeriod: credits?.onDemandCentsThisPeriod ?? 0,
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
