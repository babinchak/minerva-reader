"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Coins, Upload, Sparkles, Zap, MessageSquare, BookOpen } from "lucide-react";
import { CREDITS_REFRESH_EVENT } from "@/lib/credits-refresh";

type OnDemandLimitType = "disabled" | "fixed" | "unlimited";

interface CreditsInfo {
  tier: string;
  freeBetaMode?: boolean;
  balance: number;
  balanceCents: number;
  monthlyAllowance: number;
  allowanceCents: number;
  allowanceResetAt: string | null;
  booksUploadedThisWeek: number;
  booksUploadLimit: number;
  agenticToday: number;
  agenticLimit: number;
  onDemandLimitType: OnDemandLimitType;
  onDemandLimitCents: number;
  onDemandCreditsThisPeriod: number;
  onDemandCentsThisPeriod: number;
  creditsOverageCentsPer1000?: number;
}

interface UsageRecordDisplay {
  id: string;
  date: string;
  usageType: "chat" | "upload";
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  tokens?: number;
  included: boolean;
  costCents?: number;
  referenceId?: string;
  title?: string;
  bookTitle?: string;
  chatMode?: string;
}

export function UsageContent() {
  const [info, setInfo] = useState<CreditsInfo | null>(null);
  const [usageRecords, setUsageRecords] = useState<UsageRecordDisplay[]>([]);
  const [loading, setLoading] = useState<"pro" | "limit" | null>(null);
  const [limitType, setLimitType] = useState<OnDemandLimitType>("disabled");
  const [limitCents, setLimitCents] = useState<string>("10");

  const fetchCredits = useCallback(() => {
    fetch(`/api/credits?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  const fetchUsage = useCallback(() => {
    fetch(`/api/usage?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { records: [] }))
      .then((d) => setUsageRecords(d.records ?? []))
      .catch(() => setUsageRecords([]));
  }, []);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  useEffect(() => {
    if (info?.tier !== "anonymous") fetchUsage();
  }, [info?.tier, fetchUsage]);

  useEffect(() => {
    const handler = () => {
      fetchCredits();
      fetchUsage();
    };
    window.addEventListener(CREDITS_REFRESH_EVENT, handler);
    return () => window.removeEventListener(CREDITS_REFRESH_EVENT, handler);
  }, [fetchCredits, fetchUsage]);

  useEffect(() => {
    if (info?.onDemandLimitType) setLimitType(info.onDemandLimitType);
    if (info?.onDemandLimitCents != null) setLimitCents(String(info.onDemandLimitCents / 100));
  }, [info?.onDemandLimitType, info?.onDemandLimitCents]);

  const handleSaveOnDemandLimit = async () => {
    if (!info || info.tier !== "paid") return;
    setLoading("limit");
    try {
      const res = await fetch("/api/settings/on-demand-limit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limitType,
          limitCents: limitType === "fixed" ? Math.round(parseFloat(limitCents || "0") * 100) : undefined,
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
  const freeBetaMode = info.freeBetaMode ?? false;

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

      {!isPaid && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              Credits
            </CardTitle>
            <CardDescription>
              Free tier includes a monthly allowance. Upgrade for more.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">
                {info.balance.toLocaleString()}
              </span>
              <span className="text-muted-foreground">credits</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Monthly allowance: {info.monthlyAllowance.toLocaleString()} credits
            </p>
            <div className="flex gap-2">
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
          </CardContent>
        </Card>
      )}

      {isPaid && !freeBetaMode && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Included in Pro
              </CardTitle>
              <CardDescription>
                {info.allowanceResetAt
                  ? `Resets ${new Date(info.allowanceResetAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                  : "Monthly allowance"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const allowanceCents = info.allowanceCents ?? 0;
                const balanceCents = info.balanceCents ?? 0;
                const includedUsedCents = Math.max(0, allowanceCents - balanceCents);
                const pct = allowanceCents > 0
                  ? Math.min(100, Math.round((includedUsedCents / allowanceCents) * 100))
                  : 0;
                return (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Usage</span>
                      <span className="font-medium text-foreground">
                        {pct}% used
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                On-demand usage
              </CardTitle>
              <CardDescription>
                When included credits run out, you can keep using and pay for overage. Billed in arrears at the end of each billing period.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const onDemandCents = info.onDemandCentsThisPeriod ?? 0;
                const savedLimitCents = info.onDemandLimitType === "fixed" ? info.onDemandLimitCents : 0;
                return (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">This period</span>
                      <span className="font-medium text-foreground">
                        ${(onDemandCents / 100).toFixed(2)}
                        {savedLimitCents > 0 && (
                          <span className="text-muted-foreground font-normal"> / ${(savedLimitCents / 100).toFixed(2)}</span>
                        )}
                      </span>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-border">
                      <Label className="text-sm font-medium">Monthly limit</Label>
                      <p className="text-xs text-muted-foreground">
                        Set a fixed amount, unlimited, or disable on-demand.
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
                            value={limitCents}
                            onChange={(e) => setLimitCents(e.target.value)}
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
                  </>
                );
              })()}
            </CardContent>
          </Card>
        </>
      )}

      {isPaid && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Recent messages
              </CardTitle>
              <CardDescription>
                Chat messages with model, tokens, and cost (included or on-demand).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const chatRecords = usageRecords.filter((r) => r.usageType === "chat");
                if (chatRecords.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground py-4">
                      No chat messages yet. Usage will appear here after you send messages.
                    </p>
                  );
                }
                return (
                  <>
                    <div className="overflow-x-auto -mx-2">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-2 font-medium text-muted-foreground">Date</th>
                            <th className="text-left py-2 px-2 font-medium text-muted-foreground">Mode</th>
                            <th className="text-left py-2 px-2 font-medium text-muted-foreground">Book</th>
                            <th className="text-left py-2 px-2 font-medium text-muted-foreground">Model</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Tokens</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {chatRecords.slice(0, 50).map((r) => (
                            <tr key={r.id} className="border-b border-border/50">
                              <td className="py-2 px-2 text-foreground">
                                {new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                              </td>
                              <td className="py-2 px-2 text-muted-foreground">
                                {r.chatMode === "agentic" ? "Deep" : r.chatMode === "fast" ? "Quick" : r.chatMode ?? "—"}
                              </td>
                              <td className="py-2 px-2 text-muted-foreground max-w-[140px] truncate" title={r.bookTitle}>
                                {r.bookTitle ?? "General"}
                              </td>
                              <td className="py-2 px-2 text-muted-foreground">
                                {r.model ?? "—"}
                              </td>
                              <td className="py-2 px-2 text-right text-muted-foreground">
                                {r.tokens != null ? r.tokens.toLocaleString() : "—"}
                              </td>
                              <td className="py-2 px-2 text-right font-medium">
                                {r.included ? (
                                  <span className="text-green-600 dark:text-green-500">Included</span>
                                ) : (
                                  <span className="text-foreground">
                                    {r.costCents != null && r.costCents > 0
                                      ? `$${(r.costCents / 100).toFixed(2)}`
                                      : "—"}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {chatRecords.length > 50 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Showing 50 most recent. Total: {chatRecords.length}
                      </p>
                    )}
                  </>
                );
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Book uploads
              </CardTitle>
              <CardDescription>
                Recent book uploads with total cost.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const uploadRecords = usageRecords.filter((r) => r.usageType === "upload");
                if (uploadRecords.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground py-4">
                      No book uploads yet. Usage will appear here after you upload books (your backend records the cost).
                    </p>
                  );
                }
                return (
                  <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-2 font-medium text-muted-foreground">Date</th>
                          <th className="text-left py-2 px-2 font-medium text-muted-foreground">Book</th>
                          <th className="text-right py-2 px-2 font-medium text-muted-foreground">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadRecords.slice(0, 20).map((r) => (
                          <tr key={r.id} className="border-b border-border/50">
                            <td className="py-2 px-2 text-foreground">
                              {new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                            </td>
                            <td className="py-2 px-2 text-muted-foreground">
                              {r.title ?? "—"}
                            </td>
                            <td className="py-2 px-2 text-right font-medium">
                              {r.included ? (
                                <span className="text-green-600 dark:text-green-500">Included</span>
                              ) : (
                                <span className="text-foreground">
                                  {r.costCents != null && r.costCents > 0
                                    ? `$${(r.costCents / 100).toFixed(2)}`
                                    : "—"}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </>
      )}

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
