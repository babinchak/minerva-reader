"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Users,
  MessageSquare,
  Database,
  FileText,
  Layers,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  ArrowRight,
  Clock,
  DollarSign,
  Gauge,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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

type HealthSummary = {
  total: number;
  errors: number;
  warnings: number;
};

type RecentBook = {
  id: string;
  title: string;
  author: string | null;
  bookType: string;
  createdAt: string;
  coverUrl: string | null;
  userCount: number;
};

type NeedsAttention = {
  id: string;
  title: string;
  bookType: string;
  createdAt: string;
  hasEmbeddings: boolean;
  hasSummaries: boolean;
};

type BillingData = {
  usage: {
    today: { totalCents: number; requests: number; byType: Record<string, { count: number; totalCents: number }> };
    week: { totalCents: number; requests: number };
    month: { totalCents: number; requests: number };
  };
  tiers: {
    free: { count: number };
    paid: { count: number };
  };
};

const SERVICE_LINKS = [
  {
    label: "AWS CloudWatch",
    description: "Lambda logs & metrics",
    href: "https://us-west-2.console.aws.amazon.com/cloudwatch/home?region=us-west-2#logsV2:log-groups",
  },
  {
    label: "Vercel",
    description: "Deployments & serverless logs",
    href: "https://vercel.com/dashboard",
  },
  {
    label: "Supabase",
    description: "Database & auth",
    href: "https://supabase.com/dashboard",
  },
  {
    label: "Stripe",
    description: "Payments & subscriptions",
    href: "https://dashboard.stripe.com",
  },
];

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function MetricCard({
  label,
  value,
  icon: Icon,
  detail,
  href,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  detail?: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-1.5 text-2xl font-bold text-foreground">{value}</div>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [recentBooks, setRecentBooks] = useState<RecentBook[]>([]);
  const [needsAttention, setNeedsAttention] = useState<NeedsAttention[]>([]);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, healthRes, activityRes, billingRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/admin/health"),
        fetch("/api/admin/activity"),
        fetch("/api/admin/billing"),
      ]);

      if (!statsRes.ok || !healthRes.ok || !activityRes.ok) {
        throw new Error("Failed to load dashboard data");
      }

      const [statsData, healthData, activityData] = await Promise.all([
        statsRes.json(),
        healthRes.json(),
        activityRes.json(),
      ]);

      setStats(statsData.stats);
      setHealth(healthData.summary);
      setRecentBooks(activityData.recentBooks ?? []);
      setNeedsAttention(activityData.needsAttention ?? []);

      if (billingRes.ok) {
        setBilling(await billingRes.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">System overview and quick actions</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Health banner */}
      {health && (
        <Link href="/admin/health">
          <div className={`flex items-center justify-between rounded-lg border p-4 transition-colors hover:border-primary/30 ${
            health.total === 0
              ? "border-green-500/50 bg-green-500/5"
              : health.errors > 0
                ? "border-red-500/50 bg-red-500/5"
                : "border-orange-500/50 bg-orange-500/5"
          }`}>
            <div className="flex items-center gap-3">
              {health.total === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              ) : health.errors > 0 ? (
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              )}
              <div>
                {health.total === 0 ? (
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">
                    System healthy — no data integrity issues
                  </p>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {health.total} issue{health.total !== 1 ? "s" : ""} detected
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {health.errors > 0 && (
                        <span className="text-red-600 dark:text-red-400">{health.errors} error{health.errors !== 1 ? "s" : ""}</span>
                      )}
                      {health.errors > 0 && health.warnings > 0 && " · "}
                      {health.warnings > 0 && (
                        <span className="text-orange-600 dark:text-orange-400">{health.warnings} warning{health.warnings !== 1 ? "s" : ""}</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </Link>
      )}

      {/* Key metrics */}
      {stats && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Key Metrics</h2>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Users" value={stats.totalUsers} icon={Users} href="/admin/users" />
            <MetricCard
              label="Books"
              value={stats.totalBooks}
              icon={BookOpen}
              detail={`${stats.epubCount} EPUB · ${stats.pdfCount} PDF`}
              href="/admin/books"
            />
            <MetricCard label="Chats" value={stats.totalChats} icon={MessageSquare} />
            <MetricCard label="Summaries" value={stats.totalSummaries} icon={FileText} />
            <MetricCard label="Embedding Sections" value={stats.totalEmbeddings} icon={Database} />
            <MetricCard label="User-Book Links" value={stats.totalUserBooks} icon={Layers} />
            <MetricCard
              label="Curated Books"
              value={stats.curatedCount}
              icon={BookOpen}
              href="/admin/books"
            />
            <MetricCard
              label="Orphaned Books"
              value={stats.orphanedBookCount}
              icon={AlertTriangle}
              href="/admin/health"
            />
          </div>
        </div>
      )}

      {/* Billing overview */}
      {billing && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Billing</h2>
            <Link href="/admin/billing" className="text-xs text-primary hover:underline flex items-center gap-1">
              Details <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Spend Today"
              value={`$${(billing.usage.today.totalCents / 100).toFixed(2)}`}
              icon={DollarSign}
              detail={`${billing.usage.today.requests} requests`}
              href="/admin/billing"
            />
            <MetricCard
              label="Spend (7d)"
              value={`$${(billing.usage.week.totalCents / 100).toFixed(2)}`}
              icon={DollarSign}
              detail={`${billing.usage.week.requests} requests`}
            />
            <MetricCard
              label="Spend (30d)"
              value={`$${(billing.usage.month.totalCents / 100).toFixed(2)}`}
              icon={Gauge}
              detail={`${billing.usage.month.requests} requests`}
            />
            <MetricCard
              label="Paid Users"
              value={billing.tiers.paid.count}
              icon={Users}
              detail={`${billing.tiers.free.count} free`}
            />
          </div>
        </div>
      )}

      {/* Needs attention */}
      {needsAttention.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Needs Processing ({needsAttention.length})
            </h2>
            <Link href="/admin/books" className="text-xs text-primary hover:underline flex items-center gap-1">
              Manage books <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 divide-y divide-orange-500/20">
            {needsAttention.slice(0, 8).map((book) => (
              <div key={book.id} className="flex items-center gap-3 px-4 py-3">
                <Zap className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{book.title}</p>
                  <div className="flex gap-2 mt-0.5">
                    {!book.hasEmbeddings && (
                      <span className="text-xs text-orange-600 dark:text-orange-400">Missing vectors</span>
                    )}
                    {!book.hasSummaries && (
                      <span className="text-xs text-orange-600 dark:text-orange-400">Missing summaries</span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground uppercase">{book.bookType}</span>
              </div>
            ))}
            {needsAttention.length > 8 && (
              <div className="px-4 py-2 text-xs text-muted-foreground text-center">
                +{needsAttention.length - 8} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent books */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Recent Books</h2>
          <Link href="/admin/activity" className="text-xs text-primary hover:underline flex items-center gap-1">
            All activity <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="rounded-lg border border-border divide-y divide-border">
          {recentBooks.slice(0, 6).map((book) => (
            <div key={book.id} className="flex items-center gap-3 px-4 py-3">
              {book.coverUrl ? (
                <img
                  src={book.coverUrl}
                  alt=""
                  className="h-10 w-7 rounded object-cover shrink-0 bg-muted"
                />
              ) : (
                <div className="h-10 w-7 rounded bg-muted flex items-center justify-center shrink-0">
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{book.title}</p>
                <p className="text-xs text-muted-foreground">
                  {book.author && `${book.author} · `}
                  {book.userCount} user{book.userCount !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-xs text-muted-foreground uppercase">{book.bookType}</span>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3" />
                  {relativeTime(book.createdAt)}
                </p>
              </div>
            </div>
          ))}
          {recentBooks.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No books yet</div>
          )}
        </div>
      </div>

      {/* External services */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">External Services</h2>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {SERVICE_LINKS.map((svc) => (
            <a
              key={svc.label}
              href={svc.href}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-border bg-card p-4 hover:border-primary/30 hover:bg-muted/30 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{svc.label}</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{svc.description}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
