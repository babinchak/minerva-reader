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

    const host = req.headers.get("host") ?? "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `${protocol}://${host}`;

    const successUrl = `${baseUrl}/?success=1&upgrade=1`;
    const cancelUrl = `${baseUrl}/?canceled=1`;

    const session = await createStripeCheckoutSession({
      userId: user.id,
      successUrl,
      cancelUrl,
      mode: "subscription",
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
