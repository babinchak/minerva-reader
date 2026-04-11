"use client";

import { useMemo, useState } from "react";
import { BookCard } from "@/components/book-card";
import { BookSearchInput } from "@/components/book-search-input";
import { MinervaLogo } from "@/components/minerva-logo";
import { AUTHOR_DELIMITER } from "@/lib/pdf-metadata";

interface GridBook {
  id: string;
  title: string | null;
  author: string | null;
  coverUrl: string | null;
  bookType: "epub" | "pdf" | null;
}

interface SearchableBookGridProps {
  books: GridBook[];
  /** When true, show "Add to library" on each book card. */
  showAddToLibrary?: boolean;
  /** Book IDs already in the user's library. */
  userLibraryBookIds?: string[];
}

function formatAuthorDisplay(author: string | null): string {
  if (!author) return "";
  return author.split(AUTHOR_DELIMITER).map((a) => a.trim()).filter(Boolean).join(", ");
}

export function SearchableBookGrid({ books, showAddToLibrary, userLibraryBookIds }: SearchableBookGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const librarySet = useMemo(() => new Set(userLibraryBookIds ?? []), [userLibraryBookIds]);

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return books;
    return books.filter((book) => {
      const title = (book.title ?? "").toLowerCase();
      const author = (book.author ?? "").toLowerCase();
      return title.includes(q) || author.includes(q);
    });
  }, [books, searchQuery]);

  return (
    <div className="space-y-4">
      <BookSearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        className="w-48"
      />
      {filteredBooks.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredBooks.map((book) => (
            <BookCard
              key={book.id}
              id={book.id}
              title={book.title ?? ""}
              authorDisplay={formatAuthorDisplay(book.author)}
              coverUrl={book.coverUrl}
              bookType={book.bookType}
              showRemove={false}
              showAddToLibrary={showAddToLibrary}
              inLibrary={librarySet.has(book.id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 flex flex-col items-center gap-4 text-center">
          <MinervaLogo size={48} />
          <p className="text-sm text-muted-foreground">
            {searchQuery.trim() ? "No books match your search." : "No books in this collection yet."}
          </p>
        </div>
      )}
    </div>
  );
}
