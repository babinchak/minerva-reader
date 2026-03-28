"use client";

import Link from "next/link";
import { MinervaLogo } from "@/components/minerva-logo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AUTHOR_DELIMITER } from "@/lib/pdf-metadata";
import { BookCard } from "@/components/book-card";
import { LibrarySortControls } from "@/components/library-sort-controls";
import { UploadBookDialog } from "@/components/upload-book-dialog";
import { LibraryAIAssistant } from "@/components/library-ai-assistant";
import { CollectionsView, type CollectionSummary } from "@/components/collections-view";
import {
  CreateCollectionDialog,
  EditCollectionDialog,
  AddBooksToCollectionDialog,
} from "@/components/collection-dialogs";
import { Button } from "@/components/ui/button";
import { Library, FolderOpen } from "lucide-react";
import type {
  LibraryBookFilter,
  LibrarySortDir,
  LibrarySortType,
} from "@/components/library-sort-controls";

export interface LibraryBook {
  id: string;
  title: string | null;
  author: string | null;
  coverUrl: string | null;
  dateAdded: string;
  lastOpened: string | null;
  bookType: "epub" | "pdf" | null;
  epubNotReady?: "processing" | "error" | null;
  aiProcessing?: "processing" | "error" | null;
}

const LIBRARY_SORT_COOKIE = "librarySortPreferences";

function formatAuthorDisplay(author: string | null): string {
  if (!author) return "";
  return author.split(AUTHOR_DELIMITER).map((a) => a.trim()).filter(Boolean).join(", ");
}

export function LibraryWithBooks({
  books,
  initialSort = "lastOpened",
  initialDir = "desc",
  initialFilter = "all",
}: {
  books: LibraryBook[];
  initialSort?: LibrarySortType;
  initialDir?: LibrarySortDir;
  initialFilter?: LibraryBookFilter;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<LibrarySortType>(initialSort);
  const [dir, setDir] = useState<LibrarySortDir>(initialDir);
  const [filter, setFilter] = useState<LibraryBookFilter>(initialFilter);
  const [viewMode, setViewMode] = useState<"library" | "collections">("library");

  // Collection dialog state
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [editCollection, setEditCollection] = useState<CollectionSummary | null>(null);
  const [addBooksCollection, setAddBooksCollection] = useState<CollectionSummary | null>(null);

  // AI scope: which collection (or "library" for all books) to search
  const [aiScope, setAiScope] = useState<{ type: "library" } | { type: "collection"; id: string; name: string; bookIds: string[] }>({ type: "library" });
  const [aiOpenFromCollection, setAiOpenFromCollection] = useState(false);

  // Collections data for the AI scope dropdown
  const [collections, setCollections] = useState<(CollectionSummary & { bookIds?: string[] })[]>([]);
  const fetchCollectionsForAI = useCallback(async () => {
    try {
      const res = await fetch("/api/collections");
      if (res.ok) {
        const data = await res.json();
        setCollections(data.collections ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchCollectionsForAI();
    const handler = () => fetchCollectionsForAI();
    window.addEventListener("collections-refresh", handler);
    return () => window.removeEventListener("collections-refresh", handler);
  }, [fetchCollectionsForAI]);

  useEffect(() => {
    document.cookie =
      `${LIBRARY_SORT_COOKIE}=${encodeURIComponent(
        JSON.stringify({ sort, dir, filter })
      )}; ` +
      "path=/; max-age=31536000; samesite=lax";
  }, [sort, dir, filter]);

  // Poll for processing books: refresh server data every 10s while any book is still processing
  const hasProcessing = books.some(
    (b) => b.epubNotReady === "processing" || b.aiProcessing === "processing"
  );
  const hasProcessingRef = useRef(hasProcessing);
  hasProcessingRef.current = hasProcessing;

  useEffect(() => {
    if (!hasProcessing) return;
    const id = setInterval(() => {
      if (hasProcessingRef.current) router.refresh();
    }, 10_000);
    return () => clearInterval(id);
  }, [hasProcessing, router]);

  const visibleBooks = useMemo(() => {
    const filteredBooks =
      filter === "all"
        ? books
        : books.filter((book) => book.bookType === filter);
    const asc = dir === "asc";
    if (sort === "dateAdded") {
      return [...filteredBooks].sort((a, b) => {
        const da = new Date(a.dateAdded).getTime();
        const db = new Date(b.dateAdded).getTime();
        return asc ? da - db : db - da;
      });
    }
    if (sort === "lastOpened") {
      return [...filteredBooks].sort((a, b) => {
        // Books never opened go to the end
        if (!a.lastOpened && !b.lastOpened) return 0;
        if (!a.lastOpened) return 1;
        if (!b.lastOpened) return -1;
        const da = new Date(a.lastOpened).getTime();
        const db = new Date(b.lastOpened).getTime();
        return asc ? da - db : db - da;
      });
    }
    return [...filteredBooks].sort((a, b) => {
      const ta = (a.title ?? "").toLowerCase();
      const tb = (b.title ?? "").toLowerCase();
      const cmp = ta.localeCompare(tb);
      return asc ? cmp : -cmp;
    });
  }, [books, sort, dir, filter]);

  const handleOpenCollectionAI = async (collectionId: string, bookIds: string[]) => {
    const col = collections.find((c) => c.id === collectionId);
    setAiScope({ type: "collection", id: collectionId, name: col?.name ?? "Collection", bookIds });
    setAiOpenFromCollection(true);
  };

  const effectiveAIBookIds = aiScope.type === "library"
    ? books.map((b) => b.id)
    : aiScope.bookIds;

  return (
    <div className="w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            Library
          </h1>
          {/* Library / Collections view toggle */}
          <div
            className="inline-flex h-8 items-stretch overflow-hidden rounded-md border border-input bg-background"
            role="group"
            aria-label="View mode"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("library")}
              aria-pressed={viewMode === "library"}
              className={
                viewMode === "library"
                  ? "h-full rounded-none gap-1.5 border-0 bg-accent px-3 text-accent-foreground shadow-none hover:bg-accent"
                  : "h-full rounded-none gap-1.5 border-0 px-3 text-muted-foreground shadow-none hover:text-foreground"
              }
            >
              <Library className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Books</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("collections")}
              aria-pressed={viewMode === "collections"}
              className={
                viewMode === "collections"
                  ? "h-full rounded-none gap-1.5 border-0 bg-accent px-3 text-accent-foreground shadow-none hover:bg-accent"
                  : "h-full rounded-none gap-1.5 border-0 px-3 text-muted-foreground shadow-none hover:text-foreground"
              }
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Collections</span>
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {viewMode === "library" && (
            <LibrarySortControls
              sort={sort}
              dir={dir}
              filter={filter}
              onSortChange={(s, d) => {
                setSort(s);
                setDir(d);
              }}
              onFilterChange={setFilter}
            />
          )}
          <UploadBookDialog />
          <Link
            href="/browse"
            className="inline-flex rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Browse curated
          </Link>
          <LibraryAIAssistant
            bookIds={effectiveAIBookIds}
            collections={collections}
            aiScope={aiScope}
            onAiScopeChange={setAiScope}
            forceOpen={aiOpenFromCollection}
            onForceOpenConsumed={() => setAiOpenFromCollection(false)}
          />
        </div>
      </div>

      {viewMode === "library" ? (
        <>
          {visibleBooks.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {visibleBooks.map((book) => (
                <BookCard
                  key={book.id}
                  id={book.id}
                  title={book.title ?? ""}
                  authorDisplay={formatAuthorDisplay(book.author)}
                  author={book.author}
                  coverUrl={book.coverUrl}
                  bookType={book.bookType}
                  epubNotReady={book.epubNotReady}
                  aiProcessing={book.aiProcessing}
                  collections={collections}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 flex flex-col items-center gap-4 text-center">
              <MinervaLogo size={48} />
              <p className="text-sm text-muted-foreground">No books match this filter.</p>
            </div>
          )}
        </>
      ) : (
        <CollectionsView
          books={books}
          onCreateCollection={() => setCreateCollectionOpen(true)}
          onEditCollection={setEditCollection}
          onOpenCollectionAI={handleOpenCollectionAI}
          onAddBooksToCollection={setAddBooksCollection}
        />
      )}

      {/* Collection dialogs */}
      <CreateCollectionDialog
        open={createCollectionOpen}
        onOpenChange={setCreateCollectionOpen}
      />
      <EditCollectionDialog
        open={!!editCollection}
        onOpenChange={(open) => { if (!open) setEditCollection(null); }}
        collection={editCollection}
      />
      <AddBooksToCollectionDialog
        open={!!addBooksCollection}
        onOpenChange={(open) => { if (!open) setAddBooksCollection(null); }}
        collection={addBooksCollection}
        books={books}
      />
    </div>
  );
}
