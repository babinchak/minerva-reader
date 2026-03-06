import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  getCredits,
  getTier,
  countBooksUploadedThisWeek,
  countAgenticRequestsToday,
  CREDITS_OVERAGE_CENTS_PER_1000,
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
        balance: 0,
        balanceCents: 0,
        monthlyAllowance: 0,
        allowanceCents: 0,
        booksUploadedThisWeek: 0,
        agenticToday: 0,
        agenticLimit: freeBeta ? 999999 : 0,
        allowanceResetAt: null,
        onDemandLimitType: "disabled",
        onDemandLimitCents: 1000,
        onDemandCreditsThisPeriod: 0,
        onDemandCentsThisPeriod: 0,
        creditsOverageCentsPer1000: CREDITS_OVERAGE_CENTS_PER_1000,
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
        balance: credits?.balance ?? 0,
        balanceCents: credits?.balanceCents ?? 0,
        monthlyAllowance: credits?.monthlyAllowance ?? 0,
        allowanceCents: credits?.allowanceCents ?? 0,
        allowanceResetAt: credits?.allowanceResetAt?.toISOString() ?? null,
        booksUploadedThisWeek,
        booksUploadLimit: tier === "free" ? 3 : 999999,
        agenticToday,
        agenticLimit,
        onDemandLimitType: credits?.onDemandLimitType ?? "disabled",
        onDemandLimitCents: credits?.onDemandLimitCents ?? 1000,
        onDemandCreditsThisPeriod: credits?.onDemandCreditsThisPeriod ?? 0,
        onDemandCentsThisPeriod: credits?.onDemandCentsThisPeriod ?? 0,
        creditsOverageCentsPer1000: CREDITS_OVERAGE_CENTS_PER_1000,
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
