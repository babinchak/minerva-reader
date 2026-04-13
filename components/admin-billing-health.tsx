"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Anomaly = {
  type: string;
  message: string;
};

type UserBillingHealth = {
  userId: string;
  email: string | null;
  tier: string;
  includedBalance: number;
  extraUsageBalance: number;
  extraUsageSpent: number;
  allowanceDollars: number;
  allowanceResetAt: string | null;
  onDemandLimitType: string;
  onDemandLimitDollars: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeStatus: string | null;
  stripePeriodEnd: string | null;
  anomalies: Anomaly[];
};

type OrphanSubscription = {
  subscriptionId: string;
  customerId: string;
  status: string;
  currentPeriodEnd: string | null;
};

type HealthData = {
  users: UserBillingHealth[];
  orphanSubscriptions: OrphanSubscription[];
  totalAnomalies: number;
};

function dollars(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
        tier === "paid"
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {tier}
    </span>
  );
}

function StripeStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;

  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    trialing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    canceled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    past_due: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    unpaid: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    incomplete: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    incomplete_expired: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

export function AdminBillingHealth() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/billing/health");
      if (!res.ok) throw new Error("Failed to load billing health");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
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

  if (error || !data) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        {error ?? "No data"}
      </div>
    );
  }

  const usersWithAnomalies = data.users.filter((u) => u.anomalies.length > 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Billing Health</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cross-references database with Stripe to detect inconsistencies
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground mb-1">Total Users</div>
          <div className="text-2xl font-bold">{data.users.length}</div>
        </div>
        <div className={`rounded-lg border p-4 ${data.totalAnomalies > 0 ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30" : "border-border bg-card"}`}>
          <div className="text-xs text-muted-foreground mb-1">Anomalies</div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{data.totalAnomalies}</span>
            {data.totalAnomalies === 0 ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            )}
          </div>
        </div>
        <div className={`rounded-lg border p-4 ${data.orphanSubscriptions.length > 0 ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30" : "border-border bg-card"}`}>
          <div className="text-xs text-muted-foreground mb-1">Orphan Stripe Subscriptions</div>
          <div className="text-2xl font-bold">{data.orphanSubscriptions.length}</div>
        </div>
      </div>

      {/* Anomalies */}
      {usersWithAnomalies.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Anomalies ({usersWithAnomalies.length} users)
          </h3>
          <div className="space-y-2">
            {usersWithAnomalies.map((u) => (
              <div key={u.userId} className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-sm font-medium">{u.email ?? u.userId.slice(0, 8)}</span>
                  <TierBadge tier={u.tier} />
                </div>
                <div className="space-y-1 pl-6">
                  {u.anomalies.map((a, i) => (
                    <p key={i} className="text-xs text-amber-800 dark:text-amber-300">{a.message}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orphan Stripe Subscriptions */}
      {data.orphanSubscriptions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Orphan Stripe Subscriptions
          </h3>
          <p className="text-xs text-muted-foreground mb-2">
            Active subscriptions in Stripe not linked to any user in the database.
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            {data.orphanSubscriptions.map((s) => (
              <div key={s.subscriptionId} className="flex items-center justify-between px-4 py-3 border-t border-border first:border-t-0 hover:bg-muted/30">
                <div>
                  <p className="text-sm font-mono">{s.subscriptionId}</p>
                  <p className="text-xs text-muted-foreground">Customer: {s.customerId}</p>
                </div>
                <div className="text-right">
                  <StripeStatusBadge status={s.status} />
                  {s.currentPeriodEnd && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Period ends {new Date(s.currentPeriodEnd).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full User Table */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          All Users ({data.users.length})
        </h3>
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <th className="px-3 py-2.5 text-left">User</th>
                <th className="px-3 py-2.5 text-center">Tier</th>
                <th className="px-3 py-2.5 text-right">Included</th>
                <th className="px-3 py-2.5 text-right">Extra</th>
                <th className="px-3 py-2.5 text-right">Allowance</th>
                <th className="px-3 py-2.5 text-center">Stripe</th>
                <th className="px-3 py-2.5 text-center">Resets</th>
                <th className="px-3 py-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => {
                const hasAnomaly = u.anomalies.length > 0;
                return (
                  <tr
                    key={u.userId}
                    className={`border-t border-border hover:bg-muted/30 transition-colors ${hasAnomaly ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}`}
                  >
                    <td className="px-3 py-2.5">
                      <span className="text-sm font-medium truncate block max-w-[200px]">
                        {u.email ?? u.userId.slice(0, 8)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <TierBadge tier={u.tier} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {dollars(u.includedBalance)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {u.extraUsageBalance > 0 ? dollars(u.extraUsageBalance) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {dollars(u.allowanceDollars)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <StripeStatusBadge status={u.stripeStatus} />
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">
                      {u.allowanceResetAt
                        ? new Date(u.allowanceResetAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {hasAnomaly ? (
                        <span title={u.anomalies.map((a) => a.message).join("\n")}>
                          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 inline" />
                        </span>
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 inline" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
