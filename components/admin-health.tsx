"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Issue = {
  type: string;
  severity: "warning" | "error";
  description: string;
  resourceId: string;
  resourceName?: string;
};

type Summary = {
  total: number;
  errors: number;
  warnings: number;
};

const TYPE_LABELS: Record<string, string> = {
  orphaned_book: "Orphaned Book",
  orphaned_embedding: "Orphaned Data",
  empty_chat: "Empty Chat",
  missing_storage: "Missing Storage",
  orphaned_user_book: "Orphaned Link",
};

export function AdminHealth() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/health");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setIssues(data.issues ?? []);
      setSummary(data.summary ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run health check");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      {summary && (
        <div className={`flex items-center justify-between rounded-lg border p-4 ${
          summary.total === 0
            ? "border-green-500/50 bg-green-500/5"
            : summary.errors > 0
              ? "border-red-500/50 bg-red-500/5"
              : "border-orange-500/50 bg-orange-500/5"
        }`}>
          <div className="flex items-center gap-3">
            {summary.total === 0 ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : summary.errors > 0 ? (
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            )}
            <div>
              {summary.total === 0 ? (
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  All clear — no data integrity issues found
                </p>
              ) : (
                <p className="text-sm font-medium text-foreground">
                  {summary.total} issue{summary.total !== 1 ? "s" : ""} found
                  {summary.errors > 0 && (
                    <span className="text-red-600 dark:text-red-400"> ({summary.errors} error{summary.errors !== 1 ? "s" : ""})</span>
                  )}
                  {summary.warnings > 0 && (
                    <span className="text-orange-600 dark:text-orange-400"> ({summary.warnings} warning{summary.warnings !== 1 ? "s" : ""})</span>
                  )}
                </p>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchHealth} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Re-run
          </Button>
        </div>
      )}

      {/* Issue list */}
      {issues.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="hidden sm:grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-2.5 bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span className="w-8">Sev</span>
            <span>Issue</span>
            <span className="w-32 text-right">Type</span>
          </div>
          {issues.map((issue, i) => (
            <div
              key={`${issue.type}-${issue.resourceId}-${i}`}
              className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-1 sm:gap-4 items-center px-4 py-3 border-t border-border first:border-t-0 hover:bg-muted/30 transition-colors"
            >
              <div className="w-8 flex items-center">
                {issue.severity === "error" ? (
                  <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm">{issue.description}</p>
                <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                  {issue.resourceId}
                </p>
              </div>
              <div className="sm:w-32 sm:text-right">
                <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                  issue.severity === "error"
                    ? "bg-red-500/10 text-red-700 dark:text-red-400"
                    : "bg-orange-500/10 text-orange-700 dark:text-orange-400"
                }`}>
                  {TYPE_LABELS[issue.type] ?? issue.type}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
