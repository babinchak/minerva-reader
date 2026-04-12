"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Zap, Plus, AlertTriangle } from "lucide-react";
import { UsageContentSkeleton } from "@/components/usage-content-skeleton";
import { CREDITS_REFRESH_EVENT } from "@/lib/credits-refresh";

type OnDemandLimitType = "disabled" | "fixed" | "unlimited";

interface CreditsInfo {
  tier: string;
  freeBetaMode?: boolean;
  allowanceDollars: number;
  includedBalance: number;
  extraUsageBalance: number;
  extraUsageSpent: number;
  allowanceResetAt: string | null;
  onDemandLimitType: OnDemandLimitType;
  onDemandLimitDollars: number;
  subscriptionCancelAtPeriodEnd?: boolean;
  subscriptionCancelAt?: string | null;
}

const TOP_UP_OPTIONS = [5, 10, 20, 50];

export function UsageContent() {
  const [info, setInfo] = useState<CreditsInfo | null>(null);
  const [loading, setLoading] = useState<"pro" | "limit" | "topup" | "cancel" | "resume" | null>(null);
  const [limitType, setLimitType] = useState<OnDemandLimitType>("disabled");
  const [limitDollars, setLimitDollars] = useState<string>("10");
  const [customTopUp, setCustomTopUp] = useState<string>("");

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
    const handler = () => {
      fetchCredits();
    };
    window.addEventListener(CREDITS_REFRESH_EVENT, handler);
    return () => window.removeEventListener(CREDITS_REFRESH_EVENT, handler);
  }, [fetchCredits]);

  useEffect(() => {
    if (info?.onDemandLimitType) setLimitType(info.onDemandLimitType);
    if (info?.onDemandLimitDollars != null) setLimitDollars(String(info.onDemandLimitDollars));
  }, [info?.onDemandLimitType, info?.onDemandLimitDollars]);

  const handleSaveOnDemandLimit = async () => {
    if (!info || info.tier !== "paid") return;
    setLoading("limit");
    try {
      const res = await fetch("/api/settings/on-demand-limit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limitType,
          limitDollars: limitType === "fixed" ? parseFloat(limitDollars || "0") : undefined,
        }),
      });
      if (res.ok) {
        fetchCredits();
        window.dispatchEvent(new CustomEvent(CREDITS_REFRESH_EVENT));
      } else {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(null);
    }
  };

  const handleCheckout = async () => {
    setLoading("pro");
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
      setLoading(null);
    }
  };

  const handleTopUp = async (dollars: number) => {
    if (dollars <= 0) return;
    setLoading("topup");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "top_up", topUpDollars: dollars }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else throw new Error(data.error ?? "Top-up failed");
    } catch (err) {
      console.error(err);
      setLoading(null);
    }
  };

  const handleCancelSubscription = async () => {
    setLoading("cancel");
    try {
      const res = await fetch("/api/stripe/subscription", { method: "DELETE" });
      if (res.ok) {
        fetchCredits();
      } else {
        const data = await res.json();
        console.error(data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(null);
    }
  };

  const handleResumeSubscription = async () => {
    setLoading("resume");
    try {
      const res = await fetch("/api/stripe/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" }),
      });
      if (res.ok) {
        fetchCredits();
      } else {
        const data = await res.json();
        console.error(data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(null);
    }
  };

  if (!info) {
    return <UsageContentSkeleton />;
  }

  if (info.tier === "anonymous") {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center py-8">
            Sign in to view your usage.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isPaid = info.tier === "paid";
  const freeBetaMode = info.freeBetaMode ?? false;

  const allowanceDollars = info.allowanceDollars ?? 0;
  const includedBalance = info.includedBalance ?? 0;
  const extraUsageBalance = info.extraUsageBalance ?? 0;
  const extraUsageSpent = info.extraUsageSpent ?? 0;
  const includedPct = allowanceDollars > 0
    ? Math.min(100, Math.round(((allowanceDollars - includedBalance) / allowanceDollars) * 100))
    : 0;
  const extraLimitDollars = info.onDemandLimitDollars ?? 0;
  const extraLimitPct = info.onDemandLimitType === "fixed" && extraLimitDollars > 0
    ? Math.min(100, Math.round((extraUsageSpent / extraLimitDollars) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {freeBetaMode && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <p className="text-sm text-foreground">
              <strong>Free beta</strong> — All usage is currently free. Prices shown below reflect what these would cost at launch.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Included usage card */}
      {!freeBetaMode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              {isPaid ? "Included usage" : "Usage"}
            </CardTitle>
            <CardDescription>
              {info.allowanceResetAt
                ? `Resets ${new Date(info.allowanceResetAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                : `$${allowanceDollars.toFixed(2)}/${isPaid ? "month" : "day"} allowance`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {includedPct}% used
                </span>
                <span className="font-medium text-foreground">
                  {100 - includedPct}% remaining
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${includedPct}%` }}
                />
              </div>
            </div>
            {!isPaid && (
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => handleCheckout()}
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
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Subscription management */}
      {isPaid && !freeBetaMode && (
        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>
              {info.subscriptionCancelAtPeriodEnd
                ? `Your subscription will end on ${new Date(info.subscriptionCancelAt!).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                : info.allowanceResetAt
                  ? `Pro plan · Renews ${new Date(info.allowanceResetAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} for $${allowanceDollars.toFixed(2)}/mo`
                  : "You're on the Pro plan"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {info.subscriptionCancelAtPeriodEnd ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Your subscription is set to cancel. You'll keep access until the end of your current period.</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResumeSubscription}
                  disabled={!!loading}
                >
                  {loading === "resume" ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      Resuming...
                    </>
                  ) : (
                    "Resume subscription"
                  )}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelSubscription}
                disabled={!!loading}
                className="text-destructive hover:text-destructive"
              >
                {loading === "cancel" ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Cancelling...
                  </>
                ) : (
                  "Cancel subscription"
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Extra usage balance card */}
      {isPaid && !freeBetaMode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Extra usage
            </CardTitle>
            <CardDescription>
              When included usage runs out, extra balance is used.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Balance</span>
              <span className="font-medium text-foreground">
                ${extraUsageBalance.toFixed(2)}
              </span>
            </div>

            {info.onDemandLimitType === "fixed" && extraLimitDollars > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Monthly limit — ${extraUsageSpent.toFixed(2)} / ${extraLimitDollars.toFixed(2)}
                  </span>
                  <span className="font-medium text-foreground">
                    {100 - extraLimitPct}% remaining
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${extraLimitPct}%` }}
                  />
                </div>
                {info.allowanceResetAt && (
                  <p className="text-xs text-muted-foreground">
                    Resets {new Date(info.allowanceResetAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-3 pt-2 border-t border-border">
              <Label className="text-sm font-medium">Add balance</Label>
              <div className="flex flex-wrap gap-2">
                {TOP_UP_OPTIONS.map((amount) => (
                  <Button
                    key={amount}
                    variant="outline"
                    size="sm"
                    onClick={() => handleTopUp(amount)}
                    disabled={!!loading}
                  >
                    ${amount}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Custom"
                  value={customTopUp}
                  onChange={(e) => setCustomTopUp(e.target.value)}
                  className="w-24"
                />
                <Button
                  size="sm"
                  onClick={() => handleTopUp(parseFloat(customTopUp || "0"))}
                  disabled={!!loading || !customTopUp || parseFloat(customTopUp) <= 0}
                >
                  {loading === "topup" ? (
                    <Loader2 className="animate-spin h-4 w-4" />
                  ) : (
                    "Add"
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-border">
              <Label className="text-sm font-medium">Monthly extra usage limit</Label>
              <p className="text-xs text-muted-foreground">
                Cap how much extra usage you allow per month, or disable it entirely.
              </p>
              <div className="flex flex-wrap gap-2">
                {(["disabled", "fixed", "unlimited"] as const).map((t) => (
                  <Button
                    key={t}
                    variant={limitType === t ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLimitType(t)}
                  >
                    {t === "disabled" ? "Disabled" : t === "fixed" ? "Fixed" : "Unlimited"}
                  </Button>
                ))}
              </div>
              {limitType === "fixed" && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={limitDollars}
                    onChange={(e) => setLimitDollars(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-muted-foreground text-sm">/ month max</span>
                </div>
              )}
              <Button
                size="sm"
                onClick={handleSaveOnDemandLimit}
                disabled={!!loading}
              >
                {loading === "limit" ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
