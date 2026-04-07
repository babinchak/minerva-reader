"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  Loader2,
  MessageSquare,
  Pencil,
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import Link from "next/link";

type DemoEntry = {
  id: string;
  question: string;
  tool_calls: { toolName: string; args: Record<string, unknown> }[];
  answer: string;
  books: Record<string, { bookId: string; bookLabel: string; bookType: string | null }>;
  sort_order: number;
};

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

  // Demos
  const [demos, setDemos] = useState<DemoEntry[]>([]);
  const [demosLoading, setDemosLoading] = useState(true);
  const [demoDialogOpen, setDemoDialogOpen] = useState(false);
  const [editingDemo, setEditingDemo] = useState<DemoEntry | null>(null);
  const [demoForm, setDemoForm] = useState({ question: "", toolCalls: "[]", answer: "", books: "{}" });
  const [detectingBooks, setDetectingBooks] = useState(false);
  const [demoSaving, setDemoSaving] = useState(false);
  const [confirmDeleteDemo, setConfirmDeleteDemo] = useState<DemoEntry | null>(null);
  const [demoDeleting, setDemoDeleting] = useState(false);

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

  const fetchDemos = async () => {
    setDemosLoading(true);
    try {
      const res = await fetch(`/api/admin/curated-collections/${collectionId}/demos`);
      if (res.ok) {
        const data = (await res.json()) as { demos: DemoEntry[] };
        setDemos(data.demos ?? []);
      }
    } catch {
      // silent
    } finally {
      setDemosLoading(false);
    }
  };

  useEffect(() => {
    fetchBooks();
    fetchDemos();
  }, [collectionId]);

  const openDemoDialog = (demo?: DemoEntry) => {
    if (demo) {
      setEditingDemo(demo);
      setDemoForm({
        question: demo.question,
        toolCalls: JSON.stringify(demo.tool_calls, null, 2),
        answer: demo.answer,
        books: JSON.stringify(demo.books, null, 2),
      });
    } else {
      setEditingDemo(null);
      setDemoForm({ question: "", toolCalls: "[]", answer: "", books: "{}" });
    }
    setDemoDialogOpen(true);
  };

  const handleSaveDemo = async () => {
    let toolCalls: unknown;
    let booksJson: unknown;
    try { toolCalls = JSON.parse(demoForm.toolCalls); } catch { setError("Invalid JSON in tool calls"); return; }
    try { booksJson = JSON.parse(demoForm.books); } catch { setError("Invalid JSON in books"); return; }

    setDemoSaving(true);
    try {
      const url = `/api/admin/curated-collections/${collectionId}/demos`;
      const res = editingDemo
        ? await fetch(url, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: editingDemo.id, question: demoForm.question, toolCalls, answer: demoForm.answer, books: booksJson }),
          })
        : await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: demoForm.question, toolCalls, answer: demoForm.answer, books: booksJson }),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setDemoDialogOpen(false);
      fetchDemos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save demo");
    } finally {
      setDemoSaving(false);
    }
  };

  const handleDeleteDemo = async () => {
    if (!confirmDeleteDemo) return;
    setDemoDeleting(true);
    try {
      const res = await fetch(`/api/admin/curated-collections/${collectionId}/demos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: confirmDeleteDemo.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setConfirmDeleteDemo(null);
      fetchDemos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete demo");
    } finally {
      setDemoDeleting(false);
    }
  };

  const handleDetectBooks = async () => {
    const refIds = [...demoForm.answer.matchAll(/ref:([0-9a-f-]+)/g)].map((m) => m[1]!);
    const unique = [...new Set(refIds)];
    if (unique.length === 0) {
      setError("No ref: links found in the answer");
      return;
    }
    setDetectingBooks(true);
    try {
      const booksMap: Record<string, { bookId: string; bookLabel: string; bookType: string | null }> = {};
      await Promise.all(
        unique.map(async (sectionId) => {
          try {
            const res = await fetch(`/api/sections?sectionId=${encodeURIComponent(sectionId)}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.bookId) {
              booksMap[sectionId] = {
                bookId: data.bookId,
                bookLabel: data.bookTitle ? `${data.bookTitle}${data.bookAuthor ? ` by ${data.bookAuthor}` : ""}` : "Unknown book",
                bookType: data.bookType ?? null,
              };
            }
          } catch {
            // skip failed lookups
          }
        })
      );
      setDemoForm((f) => ({ ...f, books: JSON.stringify(booksMap, null, 2) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to detect books");
    } finally {
      setDetectingBooks(false);
    }
  };

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

      {/* Demos Section */}
      <div className="mt-10 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Demo Q&amp;As</h2>
            <p className="text-sm text-muted-foreground">
              Shown on the landing page for this collection.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => openDemoDialog()}>
            <Plus className="h-4 w-4 mr-1" />
            Add Demo
          </Button>
        </div>

        {demosLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : demos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
            No demos yet. Add a demo to show sample Q&amp;As on the landing page.
          </div>
        ) : (
          <div className="space-y-2">
            {demos.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3"
              >
                <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{d.question}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {d.answer.slice(0, 80)}...
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => openDemoDialog(d)}
                  aria-label="Edit demo"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                  onClick={() => setConfirmDeleteDemo(d)}
                  aria-label="Delete demo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Demo Dialog */}
      <Dialog open={demoDialogOpen} onOpenChange={setDemoDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingDemo ? "Edit Demo" : "Add Demo"}</DialogTitle>
            <DialogDescription>
              Paste a Q&amp;A from the collection AI chat to use as a demo on the landing page.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4 -mx-6 px-6 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="demo-question">Question</Label>
              <Input
                id="demo-question"
                value={demoForm.question}
                onChange={(e) => setDemoForm((f) => ({ ...f, question: e.target.value }))}
                placeholder="e.g. How do leaders command respect?"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-tool-calls">Tool Calls (JSON)</Label>
              <Textarea
                id="demo-tool-calls"
                value={demoForm.toolCalls}
                onChange={(e) => setDemoForm((f) => ({ ...f, toolCalls: e.target.value }))}
                className="font-mono text-xs min-h-[80px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-answer">Answer (Markdown)</Label>
              <Textarea
                id="demo-answer"
                value={demoForm.answer}
                onChange={(e) => setDemoForm((f) => ({ ...f, answer: e.target.value }))}
                className="min-h-[200px] text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="demo-books">Books (JSON: sectionId → book info)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={detectingBooks || !demoForm.answer.trim()}
                  onClick={handleDetectBooks}
                >
                  {detectingBooks && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  Detect from answer
                </Button>
              </div>
              <Textarea
                id="demo-books"
                value={demoForm.books}
                onChange={(e) => setDemoForm((f) => ({ ...f, books: e.target.value }))}
                className="font-mono text-xs min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDemoDialogOpen(false)} disabled={demoSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveDemo} disabled={demoSaving || !demoForm.question.trim() || !demoForm.answer.trim()}>
              {demoSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingDemo ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Demo Confirmation */}
      <Dialog open={!!confirmDeleteDemo} onOpenChange={() => setConfirmDeleteDemo(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Demo</DialogTitle>
            <DialogDescription>
              Delete the demo &ldquo;{confirmDeleteDemo?.question ?? ""}&rdquo;?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteDemo(null)} disabled={demoDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteDemo} disabled={demoDeleting}>
              {demoDeleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
