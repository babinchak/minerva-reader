"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { CREDITS_REFRESH_EVENT } from "@/lib/credits-refresh";

export function UpgradeCta() {
  const [loading, setLoading] = useState(false);
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

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "subscription" }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else throw new Error(data.error ?? "Checkout failed");
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{tier === "paid" ? "Pro" : "Upgrade to Pro"}</CardTitle>
        <CardDescription>
          {tier === "paid"
            ? "Unlimited uploads, best AI model, and included credits. Overage is billed in arrears."
            : "Unlimited uploads, best AI model, and more credits."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row gap-3">
        {tier !== "paid" && (
          <Button
            onClick={() => handleCheckout()}
            disabled={loading}
            className="flex-1"
          >
            {loading ? (
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
          <Button variant="outline" asChild className="flex-1">
            <Link href="/settings/usage">Manage usage</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
