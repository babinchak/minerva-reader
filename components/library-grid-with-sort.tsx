"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AUTHOR_DELIMITER } from "@/lib/pdf-metadata";
import { BookCard } from "@/components/book-card";
import { LibrarySortControls } from "@/components/library-sort-controls";
import { UploadBookDialog } from "@/components/upload-book-dialog";
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
  bookType: "epub" | "pdf" | null;
}

const LIBRARY_SORT_COOKIE = "librarySortPreferences";

function formatAuthorDisplay(author: string | null): string {
  if (!author) return "";
  return author.split(AUTHOR_DELIMITER).map((a) => a.trim()).filter(Boolean).join(", ");
}

export function LibraryWithBooks({
  books,
  initialSort = "dateAdded",
  initialDir = "desc",
  initialFilter = "all",
}: {
  books: LibraryBook[];
  initialSort?: LibrarySortType;
  initialDir?: LibrarySortDir;
  initialFilter?: LibraryBookFilter;
}) {
  const [sort, setSort] = useState<LibrarySortType>(initialSort);
  const [dir, setDir] = useState<LibrarySortDir>(initialDir);
  const [filter, setFilter] = useState<LibraryBookFilter>(initialFilter);

  useEffect(() => {
    document.cookie =
      `${LIBRARY_SORT_COOKIE}=${encodeURIComponent(
        JSON.stringify({ sort, dir, filter })
      )}; ` +
      "path=/; max-age=31536000; samesite=lax";
  }, [sort, dir, filter]);

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
    return [...filteredBooks].sort((a, b) => {
      const ta = (a.title ?? "").toLowerCase();
      const tb = (b.title ?? "").toLowerCase();
      const cmp = ta.localeCompare(tb);
      return asc ? cmp : -cmp;
    });
  }, [books, sort, dir, filter]);

  return (
    <div className="w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          Library
        </h1>
        <div className="flex flex-wrap items-center gap-2">
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
          <UploadBookDialog />
          <Link
            href="/browse"
            className="inline-flex rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Browse curated
          </Link>
        </div>
      </div>

      {visibleBooks.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {visibleBooks.map((book) => (
            <BookCard
              key={book.id}
              id={book.id}
              title={book.title ?? ""}
              authorDisplay={formatAuthorDisplay(book.author)}
              coverUrl={book.coverUrl}
              bookType={book.bookType}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          No books match this filter.
        </div>
      )}
    </div>
  );
}
