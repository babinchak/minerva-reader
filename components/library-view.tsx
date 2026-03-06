import { createClient } from "@/lib/supabase/server";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import { LibraryWithBooks } from "@/components/library-grid-with-sort";
import { UploadBookDialog } from "@/components/upload-book-dialog";
import type { LibrarySortDir, LibrarySortType } from "@/components/library-sort-controls";

const LIBRARY_SORT_COOKIE = "librarySortPreferences";

function getInitialLibrarySort(cookieValue: string | undefined): {
  sort: LibrarySortType;
  dir: LibrarySortDir;
} {
  const fallback = { sort: "dateAdded" as const, dir: "desc" as const };
  if (!cookieValue) return fallback;

  try {
    const parsed = JSON.parse(cookieValue) as {
      sort?: LibrarySortType;
      dir?: LibrarySortDir;
    };

    return {
      sort: parsed.sort === "title" ? "title" : "dateAdded",
      dir: parsed.dir === "asc" ? "asc" : "desc",
    };
  } catch {
    return fallback;
  }
}

export async function LibraryView() {
  const cookieStore = await cookies();
  const initialSortState = getInitialLibrarySort(
    cookieStore.get(LIBRARY_SORT_COOKIE)?.value
  );
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: userBookRows, error: linksError } = await supabase
    .from("user_books")
    .select("book_id, created_at, updated_at")
    .eq("user_id", user.id);

  if (linksError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        Error loading library: {linksError.message}
      </div>
    );
  }

  const hasBooks = userBookRows && userBookRows.length > 0;

  let books: { id: string; title: string | null; author: string | null; coverUrl: string | null; dateAdded: string }[] = [];
  if (hasBooks && userBookRows) {
    const bookIds = userBookRows.map((r) => r.book_id);
    const { data: booksData, error: booksError } = await supabase
      .from("books")
      .select("id, title, author, cover_path")
      .in("id", bookIds);

    if (booksError) {
      return (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          Error loading books: {booksError.message}
        </div>
      );
    }

    const dateAddedMap = new Map(
      userBookRows.map((r) => [r.book_id, r.created_at ?? r.updated_at ?? ""])
    );
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    books = (booksData || []).map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      coverUrl: book.cover_path && supabaseUrl
        ? `${supabaseUrl}/storage/v1/object/public/covers/${book.cover_path}`
        : null,
      dateAdded: dateAddedMap.get(book.id) ?? "",
    }));
  }

  return (
    <div className="w-full max-w-7xl space-y-6">
      {hasBooks ? (
        <LibraryWithBooks
          books={books}
          initialSort={initialSortState.sort}
          initialDir={initialSortState.dir}
        />
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
              Library
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <UploadBookDialog />
              <Link
                href="/browse"
                className="inline-flex items-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                Browse curated
              </Link>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Your library is empty
            </h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Upload an EPUB or PDF to get started, or browse our curated collection
              of public domain books.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <UploadBookDialog />
              <Link
                href="/browse"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                <BookOpen className="h-4 w-4" />
                Browse curated library
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
