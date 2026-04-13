"use client";


import { MinervaLogo } from "@/components/minerva-logo";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AUTHOR_DELIMITER } from "@/lib/pdf-metadata";
import { BookCard } from "@/components/book-card";
import { BookSearchInput } from "@/components/book-search-input";
import { LibrarySortControls } from "@/components/library-sort-controls";
import { UploadBookDialog } from "@/components/upload-book-dialog";
import { LibraryAIAssistant, type AIScope } from "@/components/library-ai-assistant";
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
  initialCollections = [],
  initialSort = "lastOpened",
  initialDir = "desc",
  initialFilter = "all",
}: {
  books: LibraryBook[];
  initialCollections?: CollectionSummary[];
  initialSort?: LibrarySortType;
  initialDir?: LibrarySortDir;
  initialFilter?: LibraryBookFilter;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<LibrarySortType>(initialSort);
  const [dir, setDir] = useState<LibrarySortDir>(initialDir);
  const [filter, setFilter] = useState<LibraryBookFilter>(initialFilter);
  const [viewMode, setViewMode] = useState<"library" | "collections">("library");
  const [searchQuery, setSearchQuery] = useState("");

  // Collection dialog state
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [editCollection, setEditCollection] = useState<CollectionSummary | null>(null);
  const [addBooksCollection, setAddBooksCollection] = useState<CollectionSummary | null>(null);

  // Collections state — initialized from server, synced when server re-renders (e.g. after router.refresh())
  const [collections, setCollections] = useState<CollectionSummary[]>(initialCollections);
  const initialCollectionsRef = useRef(initialCollections);
  if (initialCollections !== initialCollectionsRef.current) {
    initialCollectionsRef.current = initialCollections;
    setCollections(initialCollections);
  }

  // AI scope: which collection (or "library" for all books) to search
  const [aiScope, setAiScope] = useState<AIScope>({ type: "library" });
  const [aiOpenFromCollection, setAiOpenFromCollection] = useState(false);

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
    let filteredBooks =
      filter === "all"
        ? books
        : books.filter((book) => book.bookType === filter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filteredBooks = filteredBooks.filter((book) => {
        const title = (book.title ?? "").toLowerCase();
        const author = (book.author ?? "").toLowerCase();
        return title.includes(q) || author.includes(q);
      });
    }
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
  }, [books, sort, dir, filter, searchQuery]);

  const handleOpenCollectionAI = async (collectionId: string, bookIds: string[]) => {
    const col = collections.find((c) => c.id === collectionId);
    setAiScope({ type: "collection", id: collectionId, name: col?.name ?? "Collection", bookIds });
    setAiOpenFromCollection(true);
  };

  const effectiveAIBookIds = aiScope.type === "library"
    ? books.map((b) => b.id)
    : aiScope.bookIds ?? [];

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

      {viewMode === "library" && (
        <BookSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          className="max-w-sm"
        />
      )}

      {viewMode === "library" ? (
        <>
          {visibleBooks.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
          collections={collections}
          onCollectionsChange={setCollections}
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
        onCreated={(col) => setCollections((prev) => [col, ...prev])}
      />
      <EditCollectionDialog
        open={!!editCollection}
        onOpenChange={(open) => { if (!open) setEditCollection(null); }}
        collection={editCollection}
        onRenamed={(id, newName) =>
          setCollections((prev) => prev.map((c) => c.id === id ? { ...c, name: newName } : c))
        }
      />
      <AddBooksToCollectionDialog
        open={!!addBooksCollection}
        onOpenChange={(open) => { if (!open) setAddBooksCollection(null); }}
        collection={addBooksCollection}
        books={books}
        onBooksAdded={(colId, addedIds) =>
          setCollections((prev) =>
            prev.map((c) =>
              c.id === colId
                ? { ...c, bookIds: [...c.bookIds, ...addedIds], bookCount: c.bookCount + addedIds.length }
                : c
            )
          )
        }
      />
    </div>
  );
}
