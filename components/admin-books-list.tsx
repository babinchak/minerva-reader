"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  BookOpen,
  Calendar,
  ChevronDown,
  Clock,
  FileText,
  Loader2,
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
                  <a
                    href={`/read/${book.id}`}
                    className="text-sm text-primary hover:underline"
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
    </>
  );
}
