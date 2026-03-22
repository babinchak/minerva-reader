"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  BookOpen,
  Calendar,
  ChevronDown,
  Clock,
  Database,
  FileText,
  Info,
  Loader2,
  MessageSquare,
  Trash2,
  Users,
} from "lucide-react";
import { MinervaLogo } from "@/components/minerva-logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Book = {
  id: string;
  title: string;
  author: string | null;
  bookType: string | null;
  isCurated: boolean;
  createdAt: string | null;
  lastOpenedAt: string | null;
  coverUrl: string | null;
  userCount: number;
};

type BookDetail = {
  book: {
    id: string;
    title: string;
    author: string | null;
    bookType: string | null;
    isCurated: boolean;
    createdAt: string | null;
    lastOpenedAt: string | null;
    storagePath: string | null;
    fileName: string | null;
  };
  users: { email: string; addedAt: string | null; lastOpenedAt: string | null }[];
  chatCount: number;
  embeddingCount: number;
  summaryCounts: Record<string, number>;
};

type SortType = "lastOpened" | "dateAdded" | "title" | "userCount";
type SortDir = "asc" | "desc";
type BookFilter = "all" | "epub" | "pdf";
type CuratedFilter = "all" | "curated" | "non-curated";

const SORT_OPTIONS: { value: SortType; label: string; icon: React.ReactNode }[] = [
  { value: "lastOpened", label: "Last opened", icon: <Clock className="h-4 w-4" /> },
  { value: "dateAdded", label: "Date added", icon: <Calendar className="h-4 w-4" /> },
  { value: "title", label: "Title", icon: <ArrowDownAZ className="h-4 w-4" /> },
  { value: "userCount", label: "Users", icon: <Users className="h-4 w-4" /> },
];

const BOOK_FILTER_OPTIONS: { value: BookFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "epub", label: "EPUB" },
  { value: "pdf", label: "PDF" },
];

const CURATED_FILTER_OPTIONS: { value: CuratedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "curated", label: "Curated" },
  { value: "non-curated", label: "Non-curated" },
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

export function AdminBooksList() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Book | null>(null);

  const [detailBook, setDetailBook] = useState<Book | null>(null);
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [sort, setSort] = useState<SortType>("lastOpened");
  const [dir, setDir] = useState<SortDir>("desc");
  const [bookFilter, setBookFilter] = useState<BookFilter>("all");
  const [curatedFilter, setCuratedFilter] = useState<CuratedFilter>("all");

  const fetchBooks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/books");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { books: Book[] };
      setBooks(data.books ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load books");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const visibleBooks = useMemo(() => {
    let filtered = books;
    if (bookFilter !== "all") {
      filtered = filtered.filter((b) => b.bookType === bookFilter);
    }
    if (curatedFilter === "curated") {
      filtered = filtered.filter((b) => b.isCurated);
    } else if (curatedFilter === "non-curated") {
      filtered = filtered.filter((b) => !b.isCurated);
    }

    const asc = dir === "asc";
    return [...filtered].sort((a, b) => {
      if (sort === "title") {
        const ta = (a.title ?? "").toLowerCase();
        const tb = (b.title ?? "").toLowerCase();
        const cmp = ta.localeCompare(tb);
        return asc ? cmp : -cmp;
      }
      if (sort === "userCount") {
        return asc ? a.userCount - b.userCount : b.userCount - a.userCount;
      }
      if (sort === "dateAdded") {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return asc ? da - db : db - da;
      }
      // lastOpened
      if (!a.lastOpenedAt && !b.lastOpenedAt) return 0;
      if (!a.lastOpenedAt) return 1;
      if (!b.lastOpenedAt) return -1;
      const da = new Date(a.lastOpenedAt).getTime();
      const db = new Date(b.lastOpenedAt).getTime();
      return asc ? da - db : db - da;
    });
  }, [books, sort, dir, bookFilter, curatedFilter]);

  const handleDetailClick = async (book: Book) => {
    setDetailBook(book);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/books/${book.id}/detail`);
      if (!res.ok) throw new Error("Failed to load details");
      const data = await res.json();
      setDetail(data);
    } catch {
      // detail stays null, dialog shows error state
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDeleteClick = (book: Book) => {
    setConfirmDelete(book);
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    setDeletingId(confirmDelete.id);
    try {
      const res = await fetch(`/api/admin/books/${confirmDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setBooks((prev) => prev.filter((b) => b.id !== confirmDelete.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  const currentSort = SORT_OPTIONS.find((o) => o.value === sort) ?? SORT_OPTIONS[0];

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
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup options={BOOK_FILTER_OPTIONS} value={bookFilter} onSelect={setBookFilter} ariaLabel="Filter by type" />
          <ToggleGroup options={CURATED_FILTER_OPTIONS} value={curatedFilter} onSelect={setCuratedFilter} ariaLabel="Filter by curated" />
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Sort by" className="inline-flex items-center gap-2 border-input bg-background">
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
            aria-label={dir === "asc" ? "Ascending" : "Descending"}
            className="inline-flex items-center gap-2 border-input bg-background"
          >
            {dir === "asc" ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
            <span className="hidden sm:inline">{dir === "asc" ? "Asc" : "Desc"}</span>
          </Button>
        </div>

        {visibleBooks.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-12">
            <MinervaLogo size={48} />
            <p className="text-muted-foreground">No books match this filter.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleBooks.map((book) => (
              <div
                key={book.id}
                className={`flex flex-col rounded-lg border bg-card p-4 transition-opacity ${
                  deletingId === book.id ? "opacity-50" : ""
                }`}
              >
                <div className="flex gap-4">
                  <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded bg-muted">
                    {book.coverUrl ? (
                      <img
                        src={book.coverUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <BookOpen className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 font-medium">{book.title}</h3>
                    {book.author && (
                      <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                        {book.author}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      {book.bookType && (
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {book.bookType}
                        </span>
                      )}
                      {book.isCurated && (
                        <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          Curated
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {book.userCount}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDetailClick(book)}
                  >
                    <Info className="h-4 w-4" />
                    Details
                  </Button>
                  <a
                    href={`/read/${book.id}`}
                    className="text-sm text-primary hover:underline flex items-center"
                  >
                    Open
                  </a>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteClick(book)}
                    disabled={deletingId !== null}
                  >
                    {deletingId === book.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete book?</DialogTitle>
            <DialogDescription>
              This will permanently delete &quot;{confirmDelete?.title}&quot; and all associated
              data: user links, chats, summaries, embeddings, and storage files. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Book detail drill-down */}
      <Dialog open={!!detailBook} onOpenChange={(open) => !open && setDetailBook(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="line-clamp-2">{detailBook?.title}</DialogTitle>
            {detailBook?.author && (
              <DialogDescription>{detailBook.author}</DialogDescription>
            )}
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !detail ? (
            <p className="text-sm text-destructive py-4">Failed to load book details.</p>
          ) : (
            <div className="space-y-5">
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border border-border p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <Users className="h-3.5 w-3.5" />
                    <span className="text-xs">Users</span>
                  </div>
                  <span className="text-lg font-bold">{detail.users.length}</span>
                </div>
                <div className="rounded-md border border-border p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span className="text-xs">Chats</span>
                  </div>
                  <span className="text-lg font-bold">{detail.chatCount}</span>
                </div>
                <div className="rounded-md border border-border p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <Database className="h-3.5 w-3.5" />
                    <span className="text-xs">Embeddings</span>
                  </div>
                  <span className="text-lg font-bold">{detail.embeddingCount}</span>
                </div>
              </div>

              {/* Summaries */}
              {Object.keys(detail.summaryCounts).length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Summaries</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(detail.summaryCounts).map(([type, count]) => (
                      <span key={type} className="rounded-md bg-muted px-2.5 py-1 text-sm">
                        <span className="text-muted-foreground">{type}:</span>{" "}
                        <span className="font-medium">{count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Book metadata */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Details</h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="uppercase text-xs font-medium">{detail.book.bookType ?? "Unknown"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Curated</span>
                    <span>{detail.book.isCurated ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Added</span>
                    <span>{detail.book.createdAt ? new Date(detail.book.createdAt).toLocaleDateString() : "Unknown"}</span>
                  </div>
                  {detail.book.fileName && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground shrink-0">File</span>
                      <span className="truncate">{detail.book.fileName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Users list */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Users ({detail.users.length})
                </h4>
                {detail.users.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No users have this book.</p>
                ) : (
                  <div className="rounded-md border border-border overflow-hidden">
                    {detail.users.map((u, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between px-3 py-2 text-sm border-t border-border first:border-t-0"
                      >
                        <span className="truncate min-w-0">{u.email}</span>
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          {u.lastOpenedAt
                            ? `Opened ${new Date(u.lastOpenedAt).toLocaleDateString()}`
                            : u.addedAt
                              ? `Added ${new Date(u.addedAt).toLocaleDateString()}`
                              : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
