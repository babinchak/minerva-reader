"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, Zap, MessageSquare, BookOpen } from "lucide-react";
import { UsageContentSkeleton } from "@/components/usage-content-skeleton";
import { CREDITS_REFRESH_EVENT } from "@/lib/credits-refresh";

type OnDemandLimitType = "disabled" | "fixed" | "unlimited";

interface CreditsInfo {
  tier: string;
  freeBetaMode?: boolean;
  allowanceCents: number;
  spentCents: number;
  remainingCents: number;
  allowanceResetAt: string | null;
  booksUploadedThisWeek: number;
  booksUploadLimit: number;
  onDemandLimitType: OnDemandLimitType;
  onDemandLimitCents: number;
}

interface UsageRecordDisplay {
  id: string;
  date: string;
  usageType: "chat" | "upload";
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  tokens?: number;
  costCents: number;
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

  const allowanceCents = info.allowanceCents ?? 0;
  const spentCents = info.spentCents ?? 0;
  const usagePct = allowanceCents > 0
    ? Math.min(100, Math.round((spentCents / allowanceCents) * 100))
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

      {/* Usage allowance card — shown for both free and paid */}
      {!freeBetaMode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              {isPaid ? "Included in Pro" : "Usage"}
            </CardTitle>
            <CardDescription>
              {info.allowanceResetAt
                ? `Resets ${new Date(info.allowanceResetAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                : `$${(allowanceCents / 100).toFixed(2)}/${isPaid ? "month" : "day"} allowance`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  ${(spentCents / 100).toFixed(2)} / ${(allowanceCents / 100).toFixed(2)}
                </span>
                <span className="font-medium text-foreground">
                  {usagePct}% used
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${usagePct}%` }}
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

      {isPaid && !freeBetaMode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              On-demand usage
            </CardTitle>
            <CardDescription>
              When included usage runs out, you can keep using and pay for extra.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const overageCents = Math.max(0, spentCents - allowanceCents);
              const savedLimitCents = info.onDemandLimitType === "fixed" ? info.onDemandLimitCents : 0;
              return (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">This period</span>
                    <span className="font-medium text-foreground">
                      ${(overageCents / 100).toFixed(2)}
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
      )}

      {(isPaid || freeBetaMode) && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Recent messages
              </CardTitle>
              <CardDescription>
                Chat messages with model, tokens, and cost.
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
                              <td className="py-2 px-2 text-right font-medium text-foreground">
                                {r.costCents > 0 ? `$${(r.costCents / 100).toFixed(2)}` : "—"}
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
                      No book uploads yet. Usage will appear here after you upload books.
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
                            <td className="py-2 px-2 text-right font-medium text-foreground">
                              {r.costCents > 0 ? `$${(r.costCents / 100).toFixed(2)}` : "—"}
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

    </div>
  );
}
