import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { updateOnDemandLimit } from "@/lib/credits";
import type { OnDemandLimitType } from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      limitType?: OnDemandLimitType;
      limitCents?: number;
    };

    const limitType = body.limitType as OnDemandLimitType | undefined;
    const validTypes: OnDemandLimitType[] = ["disabled", "fixed", "unlimited"];
    if (!limitType || !validTypes.includes(limitType)) {
      return NextResponse.json(
        { error: "Invalid limitType. Must be disabled, fixed, or unlimited." },
        { status: 400 }
      );
    }

    const limitCents = body.limitCents;
    if (limitType === "fixed" && (typeof limitCents !== "number" || limitCents < 0)) {
      return NextResponse.json(
        { error: "limitCents required for fixed limit (number >= 0)" },
        { status: 400 }
      );
    }

    const ok = await updateOnDemandLimit(user.id, limitType, limitCents);
    if (!ok) {
      return NextResponse.json(
        { error: "On-demand limit is only available for Pro subscribers." },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("On-demand limit API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update" },
      { status: 500 }
    );
  }
}
