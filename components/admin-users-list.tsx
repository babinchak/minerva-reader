"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  BookOpen,
  Calendar,
  ChevronDown,
  Clock,
  Gauge,
  Loader2,
  MessageSquare,
  Users,
} from "lucide-react";
import { MinervaLogo } from "@/components/minerva-logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type User = {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  lastActiveAt: string | null;
  bookCount: number;
  chatCount: number;
  tier: string;
  balanceCents: number;
  allowanceCents: number;
  allowanceResetAt: string | null;
};

type SortType = "lastActive" | "signUp" | "bookCount" | "chatCount" | "email" | "balance";
type SortDir = "asc" | "desc";
type ActivityFilter = "all" | "active" | "inactive";

const SORT_OPTIONS: { value: SortType; label: string; icon: React.ReactNode }[] = [
  { value: "lastActive", label: "Last active", icon: <Clock className="h-4 w-4" /> },
  { value: "signUp", label: "Sign-up date", icon: <Calendar className="h-4 w-4" /> },
  { value: "bookCount", label: "Books", icon: <BookOpen className="h-4 w-4" /> },
  { value: "chatCount", label: "Chats", icon: <MessageSquare className="h-4 w-4" /> },
  { value: "email", label: "Email", icon: <ArrowDownAZ className="h-4 w-4" /> },
  { value: "balance", label: "Balance", icon: <Gauge className="h-4 w-4" /> },
];

const ACTIVITY_FILTER_OPTIONS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function ToggleGroup<T extends string>({
  options,
  value,
  onSelect,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onSelect: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="inline-flex h-8 items-stretch overflow-hidden rounded-md border border-input bg-background"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelect(option.value)}
            aria-pressed={isActive}
            className={
              isActive
                ? "h-full rounded-none gap-1.5 border-0 bg-accent px-3 text-accent-foreground shadow-none hover:bg-accent"
                : "h-full rounded-none gap-1.5 border-0 px-3 text-muted-foreground shadow-none hover:text-foreground"
            }
          >
            <span>{option.label}</span>
          </Button>
        );
      })}
    </div>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function isUserInactive(user: User): boolean {
  const lastActive = user.lastActiveAt ?? user.lastSignInAt;
  if (!lastActive) return true;
  const diffMs = Date.now() - new Date(lastActive).getTime();
  return diffMs > 30 * 24 * 60 * 60 * 1000; // 30 days
}

export function AdminUsersList() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sort, setSort] = useState<SortType>("lastActive");
  const [dir, setDir] = useState<SortDir>("desc");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/users");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { users: User[] };
        setUsers(data.users ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load users");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visibleUsers = useMemo(() => {
    let filtered = users;
    if (activityFilter === "active") {
      filtered = filtered.filter((u) => !isUserInactive(u));
    } else if (activityFilter === "inactive") {
      filtered = filtered.filter((u) => isUserInactive(u));
    }

    const asc = dir === "asc";
    return [...filtered].sort((a, b) => {
      if (sort === "email") {
        const ea = (a.email ?? "").toLowerCase();
        const eb = (b.email ?? "").toLowerCase();
        const cmp = ea.localeCompare(eb);
        return asc ? cmp : -cmp;
      }
      if (sort === "bookCount") {
        return asc ? a.bookCount - b.bookCount : b.bookCount - a.bookCount;
      }
      if (sort === "chatCount") {
        return asc ? a.chatCount - b.chatCount : b.chatCount - a.chatCount;
      }
      if (sort === "balance") {
        const pa = a.allowanceCents > 0 ? a.balanceCents / a.allowanceCents : 0;
        const pb = b.allowanceCents > 0 ? b.balanceCents / b.allowanceCents : 0;
        return asc ? pa - pb : pb - pa;
      }
      if (sort === "signUp") {
        const da = new Date(a.createdAt).getTime();
        const db = new Date(b.createdAt).getTime();
        return asc ? da - db : db - da;
      }
      // lastActive
      const getTime = (u: User) => {
        const d = u.lastActiveAt ?? u.lastSignInAt;
        return d ? new Date(d).getTime() : 0;
      };
      return asc ? getTime(a) - getTime(b) : getTime(b) - getTime(a);
    });
  }, [users, sort, dir, activityFilter]);

  const currentSort = SORT_OPTIONS.find((o) => o.value === sort) ?? SORT_OPTIONS[0];
  const totalActive = users.filter((u) => !isUserInactive(u)).length;
  const totalInactive = users.filter((u) => isUserInactive(u)).length;
  const totalPaid = users.filter((u) => u.tier === "paid").length;
  const totalFree = users.filter((u) => u.tier !== "paid").length;

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
      {/* Summary chips */}
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{users.length}</span>
          <span className="text-muted-foreground">total</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-green-500/10 px-3 py-1.5 text-green-700 dark:text-green-400">
          <span className="font-medium">{totalActive}</span>
          <span>active</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-orange-500/10 px-3 py-1.5 text-orange-700 dark:text-orange-400">
          <span className="font-medium">{totalInactive}</span>
          <span>inactive (30d+)</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-primary">
          <span className="font-medium">{totalPaid}</span>
          <span>paid</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-muted-foreground">
          <span className="font-medium">{totalFree}</span>
          <span>free</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup options={ACTIVITY_FILTER_OPTIONS} value={activityFilter} onSelect={setActivityFilter} ariaLabel="Filter by activity" />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="inline-flex items-center gap-2 border-input bg-background">
              {currentSort.icon}
              <span className="hidden sm:inline">{currentSort.label}</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setSort(option.value)}
                className={option.value === sort ? "bg-accent" : ""}
              >
                {option.icon}
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDir(dir === "asc" ? "desc" : "asc")}
          className="inline-flex items-center gap-2 border-input bg-background"
        >
          {dir === "asc" ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
          <span className="hidden sm:inline">{dir === "asc" ? "Asc" : "Desc"}</span>
        </Button>
      </div>

      {/* User list */}
      {visibleUsers.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12">
          <MinervaLogo size={48} />
          <p className="text-muted-foreground">No users match this filter.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-4 px-4 py-2.5 bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span>User</span>
            <span className="w-16 text-center">Tier</span>
            <span className="w-24 text-center">Balance</span>
            <span className="w-20 text-center">Books</span>
            <span className="w-20 text-center">Chats</span>
            <span className="w-28 text-right">Signed up</span>
            <span className="w-28 text-right">Last active</span>
          </div>
          {visibleUsers.map((u) => {
            const inactive = isUserInactive(u);
            const balancePct = u.allowanceCents > 0
              ? Math.max(0, Math.round((u.balanceCents / u.allowanceCents) * 100))
              : 0;
            return (
              <div
                key={u.id}
                className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-1 sm:gap-4 items-center px-4 py-3 border-t border-border first:border-t-0 hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {u.email ?? "No email"}
                    </span>
                    {inactive && (
                      <span className="shrink-0 rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:text-orange-400">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground sm:hidden mt-0.5">
                    {u.tier} · {balancePct}% remaining · {u.bookCount} books · {u.chatCount} chats
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
                <span className="hidden sm:flex w-24 items-center justify-center gap-1.5 text-sm">
                  <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className={balancePct <= 10 ? "text-red-600 dark:text-red-400 font-medium" : ""}>
                    {balancePct}%
                  </span>
                </span>
                <span className="hidden sm:flex w-20 items-center justify-center gap-1 text-sm">
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  {u.bookCount}
                </span>
                <span className="hidden sm:flex w-20 items-center justify-center gap-1 text-sm">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  {u.chatCount}
                </span>
                <span className="hidden sm:block w-28 text-right text-sm text-muted-foreground">
                  {formatDate(u.createdAt)}
                </span>
                <span className="hidden sm:block w-28 text-right text-sm text-muted-foreground">
                  {formatRelative(u.lastActiveAt ?? u.lastSignInAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
