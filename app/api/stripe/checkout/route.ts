import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createStripeCheckoutSession } from "@/lib/payments/stripe";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const mode = body.mode as "subscription" | "top_up";

    const host = req.headers.get("host") ?? "localhost:4000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `${protocol}://${host}`;

    const successUrl = `${baseUrl}/settings/usage?success=1${mode === "subscription" ? "&upgrade=1" : "&topup=1"}`;
    const cancelUrl = `${baseUrl}/settings/usage`;

    const session = await createStripeCheckoutSession({
      userId: user.id,
      successUrl,
      cancelUrl,
      mode,
      topUpDollars: mode === "top_up" ? parseFloat(body.topUpDollars ?? "0") : undefined,
    });

    if (!session) {
      return NextResponse.json(
        { error: "Stripe not configured or invalid request" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout failed" },
      { status: 500 }
    );
  }
}
