"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Coins, Upload, Sparkles } from "lucide-react";
import { CREDITS_REFRESH_EVENT } from "@/lib/credits-refresh";
import Link from "next/link";

interface CreditsInfo {
  tier: string;
  balance: number;
  monthlyAllowance: number;
  booksUploadedThisWeek: number;
  booksUploadLimit: number;
  agenticToday: number;
  agenticLimit: number;
}

export function UsageContent() {
  const [info, setInfo] = useState<CreditsInfo | null>(null);
  const [loading, setLoading] = useState<"pro" | "topup" | null>(null);

  const fetchCredits = useCallback(() => {
    fetch(`/api/credits?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => setInfo(null));
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

  if (!info) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (info.tier === "anonymous") {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center py-8">
            Sign in to view your usage and credits.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isPaid = info.tier === "paid";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Credits
          </CardTitle>
          <CardDescription>
            {isPaid
              ? "Your credit balance for AI features. Add more anytime."
              : "Free tier includes a monthly allowance. Upgrade for more."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">
              {info.balance.toLocaleString()}
            </span>
            <span className="text-muted-foreground">credits</span>
          </div>
          {!isPaid && (
            <p className="text-sm text-muted-foreground">
              Monthly allowance: {info.monthlyAllowance.toLocaleString()} credits
            </p>
          )}
          <div className="flex gap-2">
            {!isPaid && (
              <Button
                onClick={() => handleCheckout("subscription")}
                disabled={!!loading}
              >
                {loading === "pro" ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Redirecting...
                  </>
                ) : (
                  "Upgrade to Pro"
                )}
              </Button>
            )}
            {isPaid && (
              <Button
                variant="outline"
                onClick={() => handleCheckout("topup")}
                disabled={!!loading}
              >
                {loading === "topup" ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Redirecting...
                  </>
                ) : (
                  "Add 25k credits"
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!isPaid && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Uploads
            </CardTitle>
            <CardDescription>
              Books uploaded this week
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {info.booksUploadedThisWeek} / {info.booksUploadLimit}
            </p>
          </CardContent>
        </Card>
      )}

      {!isPaid && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI requests
            </CardTitle>
            <CardDescription>
              Agentic AI requests today
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {info.agenticToday} / {info.agenticLimit}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
