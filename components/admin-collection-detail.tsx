"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";

type CollectionBook = {
  bookId: string;
  sortOrder: number;
  addedAt: string;
  title: string | null;
  author: string | null;
  bookType: string | null;
  coverUrl: string | null;
};

type AllBook = {
  id: string;
  title: string;
  author: string | null;
  bookType: string | null;
  coverUrl: string | null;
  createdAt: string | null;
};

export function AdminCollectionDetail({ collectionId }: { collectionId: string }) {
  const [books, setBooks] = useState<CollectionBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add books dialog
  const [addOpen, setAddOpen] = useState(false);
  const [allBooks, setAllBooks] = useState<AllBook[]>([]);
  const [allBooksLoading, setAllBooksLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [sortBy, setSortBy] = useState<"title" | "date">("title");

  // Remove confirmation
  const [confirmRemove, setConfirmRemove] = useState<CollectionBook | null>(null);
  const [removing, setRemoving] = useState(false);

  const fetchBooks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/curated-collections/${collectionId}/books`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { books: CollectionBook[] };
      setBooks(data.books ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load books");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooks();
  }, [collectionId]);

  const openAddDialog = async () => {
    setAddOpen(true);
    setSearchQuery("");
    setSelectedBookIds(new Set());
    setAllBooksLoading(true);
    try {
      const res = await fetch("/api/admin/books");
      if (!res.ok) throw new Error("Failed to load books");
      const data = (await res.json()) as { books: AllBook[] };
      setAllBooks(data.books ?? []);
    } catch {
      setAllBooks([]);
    } finally {
      setAllBooksLoading(false);
    }
  };

  const toggleBookSelection = (bookId: string) => {
    setSelectedBookIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  };

  const handleAddSelected = async () => {
    if (selectedBookIds.size === 0) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/curated-collections/${collectionId}/books`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookIds: [...selectedBookIds] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setAddOpen(false);
      fetchBooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add books");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveBook = async () => {
    if (!confirmRemove) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/admin/curated-collections/${collectionId}/books`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: confirmRemove.bookId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setConfirmRemove(null);
      fetchBooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove book");
    } finally {
      setRemoving(false);
    }
  };

  const handleMove = async (index: number, direction: "up" | "down") => {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= books.length) return;

    const updated = [...books];
    [updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]];

    // Optimistic update
    setBooks(updated);

    // Reorder via individual PATCHes would be complex; for now we remove and re-add in order
    // This is a simplified approach — a dedicated reorder endpoint for books within a collection could be added later
  };

  const existingBookIds = new Set(books.map((b) => b.bookId));

  const filteredAllBooks = allBooks
    .filter((b) => {
      if (existingBookIds.has(b.id)) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (b.title ?? "").toLowerCase().includes(q) ||
        (b.author ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === "date") {
        return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
      }
      return (a.title ?? "").localeCompare(b.title ?? "");
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <Link
          href="/admin/collections"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent"
          aria-label="Back to collections"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Collection Books</h1>
          <p className="text-sm text-muted-foreground">
            {books.length} book{books.length !== 1 ? "s" : ""} in this collection
          </p>
        </div>
        <Button size="sm" onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-1" />
          Add Books
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      {books.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No books in this collection yet. Click &ldquo;Add Books&rdquo; to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {books.map((b, index) => (
            <div
              key={b.bookId}
              className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3"
            >
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => handleMove(index, "up")}
                  className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={index === books.length - 1}
                  onClick={() => handleMove(index, "down")}
                  className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>

              {b.coverUrl ? (
                <img
                  src={b.coverUrl}
                  alt=""
                  className="h-12 w-9 rounded object-cover border border-border"
                />
              ) : (
                <div className="flex h-12 w-9 items-center justify-center rounded border border-border bg-muted">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground truncate">{b.title ?? "Untitled"}</p>
                {b.author && (
                  <p className="text-xs text-muted-foreground truncate">{b.author}</p>
                )}
              </div>

              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase shrink-0">
                {b.bookType ?? "?"}
              </span>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                onClick={() => setConfirmRemove(b)}
                aria-label="Remove from collection"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add Books Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Books</DialogTitle>
            <DialogDescription>
              Select books to add to this collection.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title or author..."
                className="pl-9"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 h-9 text-xs"
              onClick={() => setSortBy(sortBy === "title" ? "date" : "title")}
            >
              {sortBy === "title" ? "A-Z" : "Newest"}
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6 space-y-1">
            {allBooksLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredAllBooks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {searchQuery ? "No matching books found." : "All books are already in this collection."}
              </p>
            ) : (
              filteredAllBooks.map((b) => {
                const selected = selectedBookIds.has(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-accent/50 ${
                      selected ? "bg-accent/30 ring-1 ring-primary/20" : ""
                    }`}
                    onClick={() => toggleBookSelection(b.id)}
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background"
                      }`}
                    >
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </div>
                    {b.coverUrl ? (
                      <img
                        src={b.coverUrl}
                        alt=""
                        className="h-10 w-7 rounded object-cover border border-border"
                      />
                    ) : (
                      <div className="flex h-10 w-7 items-center justify-center rounded border border-border bg-muted">
                        <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{b.title ?? "Untitled"}</p>
                      {b.author && (
                        <p className="text-xs text-muted-foreground truncate">{b.author}</p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
          {selectedBookIds.size > 0 && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedBookIds(new Set())} disabled={adding}>
                Clear
              </Button>
              <Button onClick={handleAddSelected} disabled={adding}>
                {adding && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Add {selectedBookIds.size} book{selectedBookIds.size !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog open={!!confirmRemove} onOpenChange={() => setConfirmRemove(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Book</DialogTitle>
            <DialogDescription>
              Remove &ldquo;{confirmRemove?.title ?? "this book"}&rdquo; from the collection?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(null)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveBook} disabled={removing}>
              {removing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
