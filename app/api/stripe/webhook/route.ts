import { NextRequest, NextResponse } from "next/server";
import { handleStripeWebhook } from "@/lib/payments/stripe";

export async function POST(req: NextRequest) {
  console.log("[Stripe webhook] Request received");
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      console.warn("[Stripe webhook] Missing stripe-signature header");
      return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
    }

    const body = await req.text();
    const eventPreview = (() => {
      try {
        const j = JSON.parse(body) as { type?: string; id?: string };
        return `${j.type ?? "?"} (${j.id ?? "?"})`;
      } catch {
        return "?";
      }
    })();
    console.log("[Stripe webhook] Incoming:", eventPreview);
    const result = await handleStripeWebhook(body, signature);

    if (!result.handled && result.error) {
      console.warn("[Stripe webhook] Handler failed:", result.error);
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[Stripe webhook] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook failed" },
      { status: 500 }
    );
  }
}
