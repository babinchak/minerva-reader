"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MinervaLogo } from "@/components/minerva-logo";

type Book = {
  id: string;
  title: string;
  author: string | null;
  bookType: string | null;
  coverUrl: string | null;
  createdAt: string | null;
  readiumManifestPath: string | null;
};

type ReprocessStatus = "idle" | "processing" | "done" | "error";

type BookWithStatus = Book & {
  reprocessStatus: ReprocessStatus;
  reprocessMessage?: string;
};

export function AdminProcessingQueue() {
  const [books, setBooks] = useState<BookWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reprocessingAll, setReprocessingAll] = useState(false);

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
      const failed = (data.books ?? [])
        .filter((b) => b.bookType === "epub" && !b.readiumManifestPath)
        .map((b) => ({ ...b, reprocessStatus: "idle" as const }));
      setBooks(failed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load books");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const reprocessOne = async (bookId: string): Promise<boolean> => {
    setBooks((prev) =>
      prev.map((b) =>
        b.id === bookId ? { ...b, reprocessStatus: "processing", reprocessMessage: undefined } : b
      )
    );

    try {
      const res = await fetch(`/api/admin/books/${bookId}/reprocess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setBooks((prev) =>
          prev.map((b) =>
            b.id === bookId
              ? { ...b, reprocessStatus: "error", reprocessMessage: data.error || `HTTP ${res.status}` }
              : b
          )
        );
        return false;
      }

      setBooks((prev) =>
        prev.map((b) =>
          b.id === bookId ? { ...b, reprocessStatus: "done", reprocessMessage: "Triggered" } : b
        )
      );
      return true;
    } catch (err) {
      setBooks((prev) =>
        prev.map((b) =>
          b.id === bookId
            ? { ...b, reprocessStatus: "error", reprocessMessage: err instanceof Error ? err.message : "Failed" }
            : b
        )
      );
      return false;
    }
  };

  const reprocessAll = async () => {
    setReprocessingAll(true);
    const pending = books.filter((b) => b.reprocessStatus === "idle" || b.reprocessStatus === "error");

    for (const book of pending) {
      if (!reprocessingAll) break; // allow stopping via re-render but won't actually work mid-loop
      await reprocessOne(book.id);
      // Small delay between invocations to avoid hammering
      await new Promise((r) => setTimeout(r, 2000));
    }

    setReprocessingAll(false);
  };

  const idleOrErrorCount = books.filter((b) => b.reprocessStatus === "idle" || b.reprocessStatus === "error").length;
  const doneCount = books.filter((b) => b.reprocessStatus === "done").length;
  const errorCount = books.filter((b) => b.reprocessStatus === "error").length;
  const processingCount = books.filter((b) => b.reprocessStatus === "processing").length;

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

  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <CheckCircle2 className="h-12 w-12 text-primary" />
        <p className="text-muted-foreground">All EPUBs have been processed successfully.</p>
        <Button variant="outline" size="sm" onClick={fetchBooks}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <span className="text-sm font-medium">{books.length} unprocessed EPUB{books.length !== 1 ? "s" : ""}</span>
          </div>
          {doneCount > 0 && (
            <span className="text-sm text-primary">{doneCount} triggered</span>
          )}
          {errorCount > 0 && (
            <span className="text-sm text-destructive">{errorCount} failed</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchBooks} disabled={reprocessingAll}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            size="sm"
            disabled={idleOrErrorCount === 0 || reprocessingAll}
            onClick={reprocessAll}
          >
            {reprocessingAll ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Reprocess All ({idleOrErrorCount})
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Book list */}
      <div className="rounded-lg border bg-card overflow-hidden divide-y divide-border">
        {books.map((book) => (
          <div key={book.id} className="flex items-center gap-4 px-4 py-3">
            {/* Cover */}
            <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">
              {book.coverUrl ? (
                <img src={book.coverUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm">{book.title || "Untitled"}</p>
              {book.author && (
                <p className="truncate text-xs text-muted-foreground">{book.author}</p>
              )}
              {book.createdAt && (
                <span className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(book.createdAt).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Status / Action */}
            <div className="shrink-0 flex items-center gap-2">
              {book.reprocessStatus === "done" && (
                <span className="flex items-center gap-1 text-xs text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Triggered
                </span>
              )}
              {book.reprocessStatus === "error" && (
                <span className="flex items-center gap-1 text-xs text-destructive" title={book.reprocessMessage}>
                  <XCircle className="h-3.5 w-3.5" />
                  {book.reprocessMessage || "Error"}
                </span>
              )}
              {book.reprocessStatus === "processing" && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {(book.reprocessStatus === "idle" || book.reprocessStatus === "error") && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reprocessingAll}
                  onClick={() => reprocessOne(book.id)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reprocess
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
