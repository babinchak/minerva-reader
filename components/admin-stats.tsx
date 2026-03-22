"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  FileText,
  Loader2,
  MessageSquare,
  Users,
  Database,
  AlertTriangle,
  Layers,
} from "lucide-react";

type Stats = {
  totalUsers: number;
  totalBooks: number;
  totalChats: number;
  totalEmbeddings: number;
  totalUserBooks: number;
  totalSummaries: number;
  orphanedBookCount: number;
  booksWithoutEmbeddingsCount: number;
  epubCount: number;
  pdfCount: number;
  curatedCount: number;
};

function StatCard({
  label,
  value,
  icon: Icon,
  detail,
  warning,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  detail?: string;
  warning?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${warning ? "border-orange-500/50 bg-orange-500/5" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`h-4 w-4 ${warning ? "text-orange-600 dark:text-orange-400" : ""}`} />
        <span className="text-sm">{label}</span>
      </div>
      <div className={`mt-2 text-2xl font-bold ${warning ? "text-orange-700 dark:text-orange-400" : "text-foreground"}`}>
        {value}
      </div>
      {detail && (
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      )}
    </div>
  );
}

export function AdminStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/stats");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        setStats(data.stats);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setLoading(false);
      }
    })();
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

  if (!stats) return null;

  return (
    <div className="space-y-6">
      {/* Core counts */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Total users" value={stats.totalUsers} icon={Users} />
          <StatCard
            label="Total books"
            value={stats.totalBooks}
            icon={BookOpen}
            detail={`${stats.epubCount} EPUB · ${stats.pdfCount} PDF · ${stats.curatedCount} curated`}
          />
          <StatCard label="Total chats" value={stats.totalChats} icon={MessageSquare} />
          <StatCard label="Embedding sections" value={stats.totalEmbeddings} icon={Database} />
          <StatCard label="User-book links" value={stats.totalUserBooks} icon={Layers} />
          <StatCard label="Summaries" value={stats.totalSummaries} icon={FileText} />
        </div>
      </div>

      {/* Warnings */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Attention</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Orphaned books"
            value={stats.orphanedBookCount}
            icon={AlertTriangle}
            detail="Books with 0 users — candidates for cleanup"
            warning={stats.orphanedBookCount > 0}
          />
          <StatCard
            label="Books without embeddings"
            value={stats.booksWithoutEmbeddingsCount}
            icon={AlertTriangle}
            detail="May indicate broken upload or processing"
            warning={stats.booksWithoutEmbeddingsCount > 0}
          />
        </div>
      </div>
    </div>
  );
}
