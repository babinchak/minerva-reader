"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BookCard } from "@/components/book-card";
import {
  ArrowLeft,
  FolderOpen,
  MoreVertical,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  BookOpen,
  ChevronRight,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BookSearchInput } from "@/components/book-search-input";
import type { LibraryBook } from "@/components/library-grid-with-sort";
import { AUTHOR_DELIMITER } from "@/lib/pdf-metadata";

export interface CollectionSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  bookCount: number;
  bookIds: string[];
}

interface CollectionsViewProps {
  books: LibraryBook[];
  collections: CollectionSummary[];
  onCollectionsChange: (collections: CollectionSummary[]) => void;
  onCreateCollection: () => void;
  onEditCollection: (collection: CollectionSummary) => void;
  onOpenCollectionAI: (collectionId: string, bookIds: string[]) => void;
  onAddBooksToCollection: (collection: CollectionSummary) => void;
  expandedCollectionId: string | null;
  onExpandedCollectionChange: (id: string | null) => void;
}

/** How many BookCards to show per collection in the overview. */
const PREVIEW_COUNT = 5;

function formatAuthorDisplay(author: string | null): string {
  if (!author) return "";
  return author.split(AUTHOR_DELIMITER).map((a) => a.trim()).filter(Boolean).join(", ");
}

export function CollectionsView({
  books,
  collections,
  onCollectionsChange,
  onCreateCollection,
  onEditCollection,
  onOpenCollectionAI,
  onAddBooksToCollection,
  expandedCollectionId,
  onExpandedCollectionChange: setExpandedCollectionId,
}: CollectionsViewProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
      if (res.ok) {
        onCollectionsChange(collections.filter((c) => c.id !== id));
        if (expandedCollectionId === id) setExpandedCollectionId(null);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleRemoveBook = async (collectionId: string, bookId: string) => {
    const res = await fetch(`/api/collections/${collectionId}/books`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId }),
    });
    if (res.ok) {
      onCollectionsChange(
        collections.map((c) =>
          c.id === collectionId
            ? { ...c, bookIds: c.bookIds.filter((id) => id !== bookId), bookCount: Math.max(0, c.bookCount - 1) }
            : c
        )
      );
    }
  };

  // Expanded view for a single collection — full grid with remove buttons
  if (expandedCollectionId) {
    const collection = collections.find((c) => c.id === expandedCollectionId);
    const allCollectionBooks = collection
      ? books.filter((b) => collection.bookIds.includes(b.id))
      : [];
    const q = searchQuery.trim().toLowerCase();
    const collectionBooks = q
      ? allCollectionBooks.filter((book) => {
          const title = (book.title ?? "").toLowerCase();
          const author = (book.author ?? "").toLowerCase();
          return title.includes(q) || author.includes(q);
        })
      : allCollectionBooks;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => { setExpandedCollectionId(null); setSearchQuery(""); }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold">{collection?.name ?? "Collection"}</h2>
          <span className="text-sm text-muted-foreground">
            {allCollectionBooks.length} book{allCollectionBooks.length !== 1 ? "s" : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <BookSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              className="w-48"
            />
            {collection && collection.bookIds.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onOpenCollectionAI(expandedCollectionId, collection.bookIds)}
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI search
              </Button>
            )}
            {collection && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onAddBooksToCollection(collection)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add books
              </Button>
            )}
          </div>
        </div>

        {collectionBooks.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {collectionBooks.map((book) => (
              <div key={book.id} className="group/col relative">
                <BookCard
                  id={book.id}
                  title={book.title ?? ""}
                  authorDisplay={formatAuthorDisplay(book.author)}
                  coverUrl={book.coverUrl}
                  bookType={book.bookType}
                  showRemove={false}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveBook(expandedCollectionId, book.id)}
                  className="absolute top-1 right-1 z-10 rounded-full bg-background/80 p-1 opacity-0 transition-opacity group-hover/col:opacity-100 hover:bg-destructive/10"
                  title="Remove from collection"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 flex flex-col items-center gap-3 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No books in this collection yet.</p>
            {collection && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAddBooksToCollection(collection)}
              >
                <Plus className="h-4 w-4" />
                Add books
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Overview: each collection shows header + preview BookCards
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {collections.length} collection{collections.length !== 1 ? "s" : ""}
        </p>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onCreateCollection}>
          <Plus className="h-3.5 w-3.5" />
          New collection
        </Button>
      </div>

      {collections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 flex flex-col items-center gap-3 text-center">
          <FolderOpen className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Create a collection to group books for focused AI search.
          </p>
          <Button variant="outline" size="sm" onClick={onCreateCollection}>
            <Plus className="h-4 w-4" />
            New collection
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {collections.map((collection) => {
            const allBooks = books.filter((b) => collection.bookIds.includes(b.id));
            const previewBooks = allBooks.slice(0, PREVIEW_COUNT);
            const hasMore = allBooks.length > PREVIEW_COUNT;
            const isDeleting = deletingId === collection.id;

            return (
              <div
                key={collection.id}
                className={`space-y-3 ${isDeleting ? "opacity-50 pointer-events-none" : ""}`}
              >
                {/* Collection header */}
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground">{collection.name}</h3>
                  <span className="text-xs text-muted-foreground">
                    {collection.bookCount} book{collection.bookCount !== 1 ? "s" : ""}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {collection.bookCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs h-7"
                        onClick={() => onOpenCollectionAI(collection.id, collection.bookIds)}
                      >
                        <Sparkles className="h-3 w-3" />
                        AI search
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEditCollection(collection)}>
                          <Pencil className="h-4 w-4" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAddBooksToCollection(collection)}>
                          <Plus className="h-4 w-4" />
                          Add books
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(collection.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Preview BookCards */}
                {previewBooks.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {previewBooks.map((book) => (
                      <BookCard
                        key={book.id}
                        id={book.id}
                        title={book.title ?? ""}
                        authorDisplay={formatAuthorDisplay(book.author)}
                        coverUrl={book.coverUrl}
                        bookType={book.bookType}
                        showRemove={false}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <BookOpen className="h-4 w-4" />
                    No books yet
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-2 h-7 text-xs"
                      onClick={() => onAddBooksToCollection(collection)}
                    >
                      Add books
                    </Button>
                  </div>
                )}

                {/* View all button */}
                {hasMore && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setExpandedCollectionId(collection.id)}
                  >
                    View all {allBooks.length} books
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
