"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Loader2,
  MessageSquare,
  RefreshCw,
  UserPlus,
  Clock,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type RecentBook = {
  id: string;
  title: string;
  author: string | null;
  bookType: string;
  createdAt: string;
  coverUrl: string | null;
  userCount: number;
};

type RecentUser = {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
};

type RecentChat = {
  id: string;
  bookId: string;
  userId: string;
  createdAt: string;
  title: string | null;
  bookTitle: string | null;
};

type NeedsAttention = {
  id: string;
  title: string;
  bookType: string;
  createdAt: string;
  hasEmbeddings: boolean;
  hasSummaries: boolean;
};

type Tab = "all" | "books" | "users" | "chats" | "processing";

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

function absoluteDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type TimelineEvent = {
  id: string;
  type: "book" | "user" | "chat";
  title: string;
  subtitle: string;
  timestamp: string;
  icon: React.ElementType;
  meta?: string;
};

function buildTimeline(
  books: RecentBook[],
  users: RecentUser[],
  chats: RecentChat[]
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const b of books) {
    events.push({
      id: `book-${b.id}`,
      type: "book",
      title: b.title,
      subtitle: b.author ?? "Unknown author",
      timestamp: b.createdAt,
      icon: BookOpen,
      meta: b.bookType.toUpperCase(),
    });
  }

  for (const u of users) {
    events.push({
      id: `user-${u.id}`,
      type: "user",
      title: u.email ?? "Unknown user",
      subtitle: "Signed up",
      timestamp: u.createdAt,
      icon: UserPlus,
    });
  }

  for (const c of chats) {
    events.push({
      id: `chat-${c.id}`,
      type: "chat",
      title: c.title ?? "Untitled chat",
      subtitle: c.bookTitle ?? "Unknown book",
      timestamp: c.createdAt,
      icon: MessageSquare,
    });
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events;
}

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "books", label: "Books" },
  { value: "users", label: "Users" },
  { value: "chats", label: "Chats" },
  { value: "processing", label: "Processing" },
];

export function AdminActivity() {
  const [recentBooks, setRecentBooks] = useState<RecentBook[]>([]);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [recentChats, setRecentChats] = useState<RecentChat[]>([]);
  const [needsAttention, setNeedsAttention] = useState<NeedsAttention[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");

  const fetchActivity = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/activity");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRecentBooks(data.recentBooks ?? []);
      setRecentUsers(data.recentUsers ?? []);
      setRecentChats(data.recentChats ?? []);
      setNeedsAttention(data.needsAttention ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
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

  const timeline = buildTimeline(recentBooks, recentUsers, recentChats);
  const filtered =
    tab === "all"
      ? timeline
      : tab === "processing"
        ? []
        : timeline.filter((e) => e.type === tab.replace(/s$/, ""));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Activity</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Recent events and processing status</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchActivity} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.value === "processing" && needsAttention.length > 0 && (
              <span className="ml-1.5 rounded-full bg-orange-500/10 px-1.5 py-0.5 text-xs text-orange-600 dark:text-orange-400">
                {needsAttention.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Processing tab */}
      {tab === "processing" && (
        <div className="space-y-4">
          {needsAttention.length === 0 ? (
            <div className="rounded-lg border border-green-500/50 bg-green-500/5 p-6 text-center">
              <Zap className="h-6 w-6 text-green-600 dark:text-green-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                All books fully processed
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Every book has embeddings and summaries
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border">
              {needsAttention.map((book) => (
                <div key={book.id} className="flex items-center gap-3 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{book.title}</p>
                    <div className="flex gap-3 mt-0.5">
                      <span className={`text-xs ${book.hasEmbeddings ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400"}`}>
                        Vectors: {book.hasEmbeddings ? "OK" : "Missing"}
                      </span>
                      <span className={`text-xs ${book.hasSummaries ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400"}`}>
                        Summaries: {book.hasSummaries ? "OK" : "Missing"}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-xs text-muted-foreground uppercase">{book.bookType}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{relativeTime(book.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      {tab !== "processing" && (
        <div className="space-y-1">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No recent activity
            </div>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border">
              {filtered.slice(0, 50).map((event) => {
                const Icon = event.icon;
                return (
                  <div key={event.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{event.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{event.subtitle}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {event.meta && (
                        <span className="text-xs text-muted-foreground uppercase">{event.meta}</span>
                      )}
                      <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                        <Clock className="h-3 w-3" />
                        <span title={absoluteDate(event.timestamp)}>{relativeTime(event.timestamp)}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
