"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BookCard } from "@/components/book-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  FolderOpen,
  MoreVertical,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  BookOpen,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LibraryBook } from "@/components/library-grid-with-sort";
import { AUTHOR_DELIMITER } from "@/lib/pdf-metadata";

export interface CollectionSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  bookCount: number;
}

interface CollectionsViewProps {
  books: LibraryBook[];
  onCreateCollection: () => void;
  onEditCollection: (collection: CollectionSummary) => void;
  onOpenCollectionAI: (collectionId: string, bookIds: string[]) => void;
  onAddBooksToCollection: (collection: CollectionSummary) => void;
}

function formatAuthorDisplay(author: string | null): string {
  if (!author) return "";
  return author.split(AUTHOR_DELIMITER).map((a) => a.trim()).filter(Boolean).join(", ");
}

export function CollectionsView({
  books,
  onCreateCollection,
  onEditCollection,
  onOpenCollectionAI,
  onAddBooksToCollection,
}: CollectionsViewProps) {
  const router = useRouter();
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCollectionId, setOpenCollectionId] = useState<string | null>(null);
  const [collectionBookIds, setCollectionBookIds] = useState<string[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCollections = useCallback(async () => {
    try {
      const res = await fetch("/api/collections");
      if (res.ok) {
        const data = await res.json();
        setCollections(data.collections ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  // Listen for refetch events (e.g. after creating/editing a collection)
  useEffect(() => {
    const handler = () => fetchCollections();
    window.addEventListener("collections-refresh", handler);
    return () => window.removeEventListener("collections-refresh", handler);
  }, [fetchCollections]);

  const openCollection = async (id: string) => {
    setOpenCollectionId(id);
    setLoadingBooks(true);
    try {
      const res = await fetch(`/api/collections/${id}/books`);
      if (res.ok) {
        const data = await res.json();
        setCollectionBookIds(data.bookIds ?? []);
      }
    } finally {
      setLoadingBooks(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
      if (res.ok) {
        setCollections((prev) => prev.filter((c) => c.id !== id));
        if (openCollectionId === id) {
          setOpenCollectionId(null);
          setCollectionBookIds([]);
        }
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleRemoveBook = async (bookId: string) => {
    if (!openCollectionId) return;
    const res = await fetch(`/api/collections/${openCollectionId}/books`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId }),
    });
    if (res.ok) {
      setCollectionBookIds((prev) => prev.filter((id) => id !== bookId));
      setCollections((prev) =>
        prev.map((c) =>
          c.id === openCollectionId ? { ...c, bookCount: Math.max(0, c.bookCount - 1) } : c
        )
      );
    }
  };

  // Detail view for an open collection
  if (openCollectionId) {
    const collection = collections.find((c) => c.id === openCollectionId);
    const collectionBooks = books.filter((b) => collectionBookIds.includes(b.id));

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              setOpenCollectionId(null);
              setCollectionBookIds([]);
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold">{collection?.name ?? "Collection"}</h2>
          <span className="text-sm text-muted-foreground">
            {collectionBookIds.length} book{collectionBookIds.length !== 1 ? "s" : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {collectionBookIds.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onOpenCollectionAI(openCollectionId, collectionBookIds)}
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

        {loadingBooks ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3] rounded-lg" />
            ))}
          </div>
        ) : collectionBooks.length > 0 ? (
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
                  onClick={() => handleRemoveBook(book.id)}
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

  // Collections grid
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    );
  }

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {collections.map((collection) => {
            // Show up to 4 cover thumbnails
            const previewBooks = books.slice(0, 4); // We don't know which books are in each collection without fetching, so we skip previews in the grid
            return (
              <div
                key={collection.id}
                className={`group relative flex flex-col rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50 cursor-pointer ${
                  deletingId === collection.id ? "opacity-50 pointer-events-none" : ""
                }`}
                onClick={() => openCollection(collection.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground truncate">{collection.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {collection.bookCount} book{collection.bookCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditCollection(collection);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddBooksToCollection(collection);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                        Add books
                      </DropdownMenuItem>
                      {collection.bookCount > 0 && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            openCollection(collection.id);
                            // The AI button is inside the detail view
                          }}
                        >
                          <Sparkles className="h-4 w-4" />
                          AI search
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(collection.id);
                        }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-3 flex items-center gap-1">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
