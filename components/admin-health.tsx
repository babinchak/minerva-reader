"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
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

type GroupMeta = {
  label: string;
  explanation: string;
  severity: "warning" | "error";
};

const GROUP_META: Record<string, GroupMeta> = {
  orphaned_book: {
    label: "Orphaned books",
    explanation: "Books with 0 users linked — candidates for cleanup",
    severity: "warning",
  },
  orphaned_embedding: {
    label: "Orphaned embeddings",
    explanation: "Embedding sections referencing books that no longer exist in the database",
    severity: "error",
  },
  orphaned_chat: {
    label: "Orphaned chats",
    explanation: "Chats referencing books that no longer exist in the database",
    severity: "error",
  },
  orphaned_user_book: {
    label: "Orphaned user-book links",
    explanation: "user_books rows referencing books that no longer exist",
    severity: "error",
  },
  orphaned_summary: {
    label: "Orphaned summaries",
    explanation: "Summaries referencing books that no longer exist in the database",
    severity: "error",
  },
  empty_chat: {
    label: "Empty chats",
    explanation: "Chats that have zero messages",
    severity: "warning",
  },
  missing_storage: {
    label: "Missing storage path",
    explanation: "Books with no storage_path set — file may be missing",
    severity: "warning",
  },
  no_embeddings: {
    label: "Books without embeddings",
    explanation: "Books that have not been processed for vector search — AI search won't work for these",
    severity: "warning",
  },
  no_summaries: {
    label: "Books without summaries",
    explanation: "Books that have no generated summaries",
    severity: "warning",
  },
  inconsistent_embeddings: {
    label: "Embedding data inconsistency",
    explanation: "Books marked as processed but with no actual embedding rows in the database",
    severity: "error",
  },
  inconsistent_summaries: {
    label: "Summary data inconsistency",
    explanation: "Books marked as processed but with no actual summary rows in the database",
    severity: "error",
  },
};

// Order groups should appear in
const GROUP_ORDER = [
  "orphaned_embedding",
  "orphaned_chat",
  "orphaned_user_book",
  "orphaned_summary",
  "orphaned_book",
  "missing_storage",
  "no_embeddings",
  "no_summaries",
  "inconsistent_embeddings",
  "inconsistent_summaries",
  "empty_chat",
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      title="Copy ID"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function ReprocessButton({
  bookId,
  action,
  onSuccess,
}: {
  bookId: string;
  action: "summaries" | "vectors";
  onSuccess?: () => void;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setState("loading");
    try {
      const res = await fetch(`/api/admin/books/${bookId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, force: true }),
      });
      if (!res.ok) throw new Error();
      setState("done");
      onSuccess?.();
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  };

  if (state === "done") {
    return (
      <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
        <Check className="h-3.5 w-3.5" /> Triggered
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === "loading"}
      className="shrink-0 rounded px-2 py-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors flex items-center gap-1"
      title={action === "vectors" ? "Reprocess embeddings" : "Reprocess summaries"}
    >
      {state === "loading" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : state === "error" ? (
        <XCircle className="h-3 w-3 text-red-500" />
      ) : (
        <Play className="h-3 w-3" />
      )}
      {action === "vectors" ? "Embeddings" : "Summaries"}
    </button>
  );
}

function ReprocessAllButton({
  issues,
  action,
  onAllTriggered,
}: {
  issues: Issue[];
  action: "summaries" | "vectors";
  onAllTriggered?: () => void;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setState("loading");
    setProgress(0);
    let failed = 0;
    for (let i = 0; i < issues.length; i++) {
      try {
        const res = await fetch(`/api/admin/books/${issues[i].resourceId}/regenerate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, force: true }),
        });
        if (!res.ok) failed++;
      } catch {
        failed++;
      }
      setProgress(i + 1);
    }
    setState(failed === 0 ? "done" : "error");
    if (failed === 0) onAllTriggered?.();
  };

  if (state === "done") {
    return (
      <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
        <Check className="h-3.5 w-3.5" /> All triggered
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === "loading"}
      className="shrink-0 rounded px-2.5 py-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors flex items-center gap-1.5"
      title={`Reprocess all ${action === "vectors" ? "embeddings" : "summaries"}`}
    >
      {state === "loading" ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          {progress}/{issues.length}
        </>
      ) : state === "error" ? (
        <>
          <XCircle className="h-3 w-3 text-red-500" /> Some failed
        </>
      ) : (
        <>
          <Play className="h-3 w-3" /> Reprocess all
        </>
      )}
    </button>
  );
}

function IssueGroup({ type, issues, onRefresh }: { type: string; issues: Issue[]; onRefresh?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const meta = GROUP_META[type] ?? {
    label: type,
    explanation: "",
    severity: "warning" as const,
  };
  const isError = meta.severity === "error";
  const reprocessAction = type === "no_embeddings" ? "vectors" as const
    : type === "no_summaries" ? "summaries" as const
    : null;

  return (
    <div className={`rounded-lg border overflow-hidden ${
      isError ? "border-red-500/30" : "border-orange-500/30"
    }`}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } }}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors cursor-pointer ${
          isError ? "bg-red-500/5" : "bg-orange-500/5"
        }`}
      >
        {isError ? (
          <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{meta.label}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              isError
                ? "bg-red-500/10 text-red-700 dark:text-red-400"
                : "bg-orange-500/10 text-orange-700 dark:text-orange-400"
            }`}>
              {issues.length}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{meta.explanation}</p>
        </div>
        {reprocessAction && (
          <ReprocessAllButton issues={issues} action={reprocessAction} onAllTriggered={onRefresh} />
        )}
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </div>

      {expanded && (
        <div className="border-t border-border">
          {issues.map((issue, i) => (
            <div
              key={`${issue.resourceId}-${i}`}
              className="flex items-center gap-3 px-4 py-2.5 border-t border-border first:border-t-0 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p>{issue.description}</p>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                {reprocessAction && (
                  <ReprocessButton bookId={issue.resourceId} action={reprocessAction} />
                )}
                <span className="text-xs text-muted-foreground font-mono">
                  {issue.resourceId.slice(0, 8)}...
                </span>
                <CopyButton text={issue.resourceId} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminHealth() {
  const [groups, setGroups] = useState<Record<string, Issue[]>>({});
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
      setGroups(data.groups ?? {});
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

  // Get ordered list of groups that have issues
  const activeGroups = GROUP_ORDER.filter((type) => groups[type]?.length > 0);
  // Include any types not in GROUP_ORDER (safety net)
  for (const type of Object.keys(groups)) {
    if (!GROUP_ORDER.includes(type) && groups[type].length > 0) {
      activeGroups.push(type);
    }
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
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {summary.total} issue{summary.total !== 1 ? "s" : ""} across {activeGroups.length} categor{activeGroups.length !== 1 ? "ies" : "y"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {summary.errors > 0 && (
                      <span className="text-red-600 dark:text-red-400">{summary.errors} error{summary.errors !== 1 ? "s" : ""}</span>
                    )}
                    {summary.errors > 0 && summary.warnings > 0 && " · "}
                    {summary.warnings > 0 && (
                      <span className="text-orange-600 dark:text-orange-400">{summary.warnings} warning{summary.warnings !== 1 ? "s" : ""}</span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchHealth} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Re-run
          </Button>
        </div>
      )}

      {/* Grouped issues */}
      {activeGroups.length > 0 && (
        <div className="space-y-3">
          {activeGroups.map((type) => (
            <IssueGroup key={type} type={type} issues={groups[type]} onRefresh={fetchHealth} />
          ))}
        </div>
      )}
    </div>
  );
}
