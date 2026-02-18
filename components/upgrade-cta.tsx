"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { CREDITS_REFRESH_EVENT } from "@/lib/credits-refresh";

export function UpgradeCta() {
  const [loading, setLoading] = useState<"pro" | "topup" | null>(null);
  const [tier, setTier] = useState<string | null>(null);

  const fetchCredits = useCallback(() => {
    fetch(`/api/credits?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setTier(d?.tier ?? null))
      .catch(() => setTier(null));
  }, []);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  useEffect(() => {
    const handler = () => fetchCredits();
    window.addEventListener(CREDITS_REFRESH_EVENT, handler);
    return () => window.removeEventListener(CREDITS_REFRESH_EVENT, handler);
  }, [fetchCredits]);

  const handleCheckout = async (mode: "subscription" | "topup") => {
    setLoading(mode === "subscription" ? "pro" : "topup");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "subscription" ? { mode: "subscription" } : { mode: "topup", credits: 25000 }
        ),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else throw new Error(data.error ?? "Checkout failed");
    } catch (err) {
      console.error(err);
      setLoading(null);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{tier === "paid" ? "Pro" : "Upgrade to Pro"}</CardTitle>
        <CardDescription>
          {tier === "paid"
            ? "Unlimited uploads, best AI model, and more credits. Add credits anytime."
            : "Unlimited uploads, best AI model, and more credits."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row gap-3">
        {tier !== "paid" && (
          <Button
            onClick={() => handleCheckout("subscription")}
            disabled={!!loading}
            className="flex-1"
          >
            {loading === "pro" ? (
              <>
                <Loader2 className="animate-spin h-4 w-4" />
                Redirecting...
              </>
            ) : (
              "Subscribe to Pro"
            )}
          </Button>
        )}
        {tier === "paid" && (
          <Button
            variant="outline"
            onClick={() => handleCheckout("topup")}
            disabled={!!loading}
            className="flex-1"
          >
            {loading === "topup" ? (
              <>
                <Loader2 className="animate-spin h-4 w-4" />
                Redirecting...
              </>
            ) : (
              "Add 25k credits"
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
