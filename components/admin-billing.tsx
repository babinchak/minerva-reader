"use client";

import { useEffect, useState } from "react";
import {
  DollarSign,
  Gauge,
  Loader2,
  RefreshCw,
  Users,
  MessageSquare,
  BookOpen,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type TierCategoryCounts = { count: number; totalCents: number };

type UsagePeriod = {
  totalCents: number;
  includedCents: number;
  onDemandCents: number;
  requests: number;
  byType: Record<string, { count: number; totalCents: number }>;
  byTierCategory: Record<string, Record<string, TierCategoryCounts>>;
};

type BillingUser = {
  userId: string;
  tier: string;
  balanceCents: number;
  allowanceCents: number;
  allowanceResetAt: string | null;
  onDemandLimitType: string;
  onDemandCentsThisPeriod: number;
};

type BillingData = {
  usage: { today: UsagePeriod; week: UsagePeriod; month: UsagePeriod };
  tiers: {
    free: { count: number; totalBalanceCents: number; totalAllowanceCents: number };
    paid: { count: number; totalBalanceCents: number; totalAllowanceCents: number; onDemandCentsThisPeriod: number };
  };
  users: BillingUser[];
};

// Map from auth users to get emails
type AuthUser = {
  id: string;
  email: string | null;
};

const USAGE_TYPE_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  chat: { label: "Quick chat", icon: MessageSquare },
  chat_agentic: { label: "Deep chat", icon: Zap },
  upload: { label: "Upload", icon: BookOpen },
  summary_book: { label: "Book summary", icon: BookOpen },
  summary_chapter: { label: "Chapter summary", icon: BookOpen },
  embedding: { label: "Embedding", icon: BookOpen },
};

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function PeriodCard({ label, period }: { label: string; period: UsagePeriod }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <DollarSign className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-2xl font-bold text-foreground">{dollars(period.totalCents)}</div>
      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
        <span>{period.requests} requests</span>
        {period.onDemandCents > 0 && (
          <span className="text-orange-600 dark:text-orange-400">
            {dollars(period.onDemandCents)} on-demand
          </span>
        )}
      </div>
      {Object.keys(period.byType).length > 0 && (
        <div className="mt-3 space-y-1">
          {Object.entries(period.byType)
            .sort(([, a], [, b]) => b.totalCents - a.totalCents)
            .map(([type, data]) => {
              const meta = USAGE_TYPE_LABELS[type] ?? { label: type, icon: DollarSign };
              const Icon = meta.icon;
              return (
                <div key={type} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                  <span className="font-medium">
                    {dollars(data.totalCents)} <span className="text-muted-foreground font-normal">({data.count})</span>
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function TierCostCard({
  label,
  description,
  periods,
  tier,
  categories,
  categoryLabels,
}: {
  label: string;
  description: string;
  periods: [string, UsagePeriod][];
  tier: string;
  categories: string[];
  categoryLabels: Record<string, string>;
}) {
  // Total across all categories for each period
  const periodTotals = periods.map(([, p]) => {
    let total = 0;
    for (const cat of categories) {
      total += p.byTierCategory?.[tier]?.[cat]?.totalCents ?? 0;
    }
    return total;
  });
  const hasAnyData = periodTotals.some((t) => t > 0);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="space-y-3">
        {periods.map(([periodLabel, period], i) => {
          const total = periodTotals[i];
          return (
            <div key={periodLabel}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">{periodLabel}</span>
                <span className={`text-sm font-semibold tabular-nums ${total > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                  {dollars(total)}
                </span>
              </div>
              {categories.length > 1 && (
                <div className="flex gap-4 pl-2">
                  {categories.map((cat) => {
                    const d = period.byTierCategory?.[tier]?.[cat];
                    const cents = d?.totalCents ?? 0;
                    const count = d?.count ?? 0;
                    return (
                      <div key={cat} className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">{categoryLabels[cat]}:</span>
                        {cents > 0 ? (
                          <span className="tabular-nums">
                            <span className="font-medium">{dollars(cents)}</span>
                            <span className="text-muted-foreground ml-0.5">({count})</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {categories.length === 1 && (
                <div className="pl-2 text-xs text-muted-foreground">
                  {(() => {
                    const d = period.byTierCategory?.[tier]?.[categories[0]];
                    const count = d?.count ?? 0;
                    return count > 0 ? `${count} request${count !== 1 ? "s" : ""}` : "No requests";
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!hasAnyData && (
        <p className="text-xs text-muted-foreground mt-2 text-center">No usage recorded yet</p>
      )}
    </div>
  );
}

export function AdminBilling() {
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [authUsers, setAuthUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [billingRes, usersRes] = await Promise.all([
        fetch("/api/admin/billing"),
        fetch("/api/admin/users"),
      ]);
      if (!billingRes.ok) throw new Error("Failed to load billing data");
      const billingData = await billingRes.json();
      setBilling(billingData);

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setAuthUsers(
          (usersData.users ?? []).map((u: { id: string; email: string | null }) => ({
            id: u.id,
            email: u.email,
          }))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load billing");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !billing) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        {error ?? "No billing data"}
      </div>
    );
  }

  const emailMap = new Map(authUsers.map((u) => [u.id, u.email]));

  // Sort users: paid first, then by balance % ascending (lowest first = most attention needed)
  const sortedUsers = [...billing.users].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "paid" ? -1 : 1;
    const pctA = a.allowanceCents > 0 ? a.balanceCents / a.allowanceCents : 0;
    const pctB = b.allowanceCents > 0 ? b.balanceCents / b.allowanceCents : 0;
    return pctA - pctB;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Billing</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Usage costs and user balances</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Usage by period */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Usage Costs</h2>
        <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
          <PeriodCard label="Today" period={billing.usage.today} />
          <PeriodCard label="Last 7 days" period={billing.usage.week} />
          <PeriodCard label="Last 30 days" period={billing.usage.month} />
        </div>
      </div>

      {/* Cost by tier × category */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Cost by Tier</h2>
        <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
          {/* Anonymous — chat only */}
          <TierCostCard
            label="Anonymous"
            description="Chat only (gpt-5.4-mini)"
            periods={[
              ["Today", billing.usage.today],
              ["7d", billing.usage.week],
              ["30d", billing.usage.month],
            ]}
            tier="anonymous"
            categories={["chat"]}
            categoryLabels={{ chat: "Chat" }}
          />
          {/* Free */}
          <TierCostCard
            label="Free"
            description="Daily allowance"
            periods={[
              ["Today", billing.usage.today],
              ["7d", billing.usage.week],
              ["30d", billing.usage.month],
            ]}
            tier="free"
            categories={["chat", "books"]}
            categoryLabels={{ chat: "Chat", books: "Books" }}
          />
          {/* Paid */}
          <TierCostCard
            label="Paid"
            description="Monthly allowance + on-demand"
            periods={[
              ["Today", billing.usage.today],
              ["7d", billing.usage.week],
              ["30d", billing.usage.month],
            ]}
            tier="paid"
            categories={["chat", "books"]}
            categoryLabels={{ chat: "Chat", books: "Books" }}
          />
        </div>
      </div>

      {/* Tier overview */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Tier Overview</h2>
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Users className="h-4 w-4" />
              <span className="text-xs">Free Tier</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{billing.tiers.free.count}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Aggregate balance: {dollars(billing.tiers.free.totalBalanceCents)} / {dollars(billing.tiers.free.totalAllowanceCents)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Users className="h-4 w-4" />
              <span className="text-xs">Paid Tier</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{billing.tiers.paid.count}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Aggregate balance: {dollars(billing.tiers.paid.totalBalanceCents)} / {dollars(billing.tiers.paid.totalAllowanceCents)}
            </p>
            {billing.tiers.paid.onDemandCentsThisPeriod > 0 && (
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                On-demand this period: {dollars(billing.tiers.paid.onDemandCentsThisPeriod)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Per-user balances */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          User Balances ({sortedUsers.length})
        </h2>
        {sortedUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No users with billing data yet.</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2.5 bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <span>User</span>
              <span className="w-16 text-center">Tier</span>
              <span className="w-32 text-center">Balance</span>
              <span className="w-24 text-center">On-demand</span>
              <span className="w-32 text-right">Resets</span>
            </div>
            {sortedUsers.map((u) => {
              const pct = u.allowanceCents > 0
                ? Math.max(0, Math.round((u.balanceCents / u.allowanceCents) * 100))
                : 0;
              const email = emailMap.get(u.userId) ?? u.userId.slice(0, 8);
              const resetLabel = u.allowanceResetAt
                ? new Date(u.allowanceResetAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                : "—";

              return (
                <div
                  key={u.userId}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto_auto] gap-1 sm:gap-4 items-center px-4 py-3 border-t border-border first:border-t-0 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="truncate text-sm font-medium block">{email}</span>
                    <p className="text-xs text-muted-foreground sm:hidden mt-0.5">
                      {u.tier} · {pct}% · resets {resetLabel}
                    </p>
                  </div>
                  <span className="hidden sm:flex w-16 items-center justify-center">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      u.tier === "paid"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {u.tier}
                    </span>
                  </span>
                  <span className="hidden sm:flex w-32 items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          pct <= 10 ? "bg-red-500" : pct <= 30 ? "bg-orange-500" : "bg-green-500"
                        }`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-medium w-10 text-right ${
                      pct <= 10 ? "text-red-600 dark:text-red-400" : ""
                    }`}>
                      {pct}%
                    </span>
                  </span>
                  <span className="hidden sm:block w-24 text-center text-xs text-muted-foreground">
                    {u.onDemandLimitType === "disabled" ? "off" : u.onDemandLimitType}
                    {u.onDemandCentsThisPeriod > 0 && (
                      <span className="text-orange-600 dark:text-orange-400 ml-1">
                        {dollars(u.onDemandCentsThisPeriod)}
                      </span>
                    )}
                  </span>
                  <span className="hidden sm:block w-32 text-right text-xs text-muted-foreground">
                    {resetLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
