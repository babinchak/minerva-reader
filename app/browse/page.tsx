import { createServiceClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SiteNav } from "@/components/site-nav";
import { hasEnvVars } from "@/lib/utils";
import { EnvVarWarning } from "@/components/env-var-warning";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { BrowseCuratedView } from "@/components/browse-curated-view";
import type {
  LibraryBookFilter,
  LibrarySortDir,
  LibrarySortType,
} from "@/components/library-sort-controls";

const LIBRARY_SORT_COOKIE = "librarySortPreferences";

function getInitialSort(cookieValue: string | undefined): {
  sort: LibrarySortType;
  dir: LibrarySortDir;
  filter: LibraryBookFilter;
} {
  const fallback = {
    sort: "dateAdded" as const,
    dir: "desc" as const,
    filter: "all" as const,
  };
  if (!cookieValue) return fallback;
  try {
    const parsed = JSON.parse(cookieValue) as {
      sort?: LibrarySortType;
      dir?: LibrarySortDir;
      filter?: LibraryBookFilter;
    };
    return {
      sort: parsed.sort === "title" ? "title" : "dateAdded",
      dir: parsed.dir === "asc" ? "asc" : "desc",
      filter:
        parsed.filter === "epub" || parsed.filter === "pdf"
          ? parsed.filter
          : "all",
    };
  } catch {
    return fallback;
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BrowsePage() {
  if (!hasEnvVars) {
    return (
      <main className="min-h-screen flex flex-col items-center text-foreground">
        <SiteNav rightSlot={<><EnvVarWarning /><ThemeSwitcher /></>} />
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-muted-foreground">Configure environment variables to continue.</p>
        </div>
      </main>
    );
  }

  const supabase = createServiceClient();
  const { data: books, error } = await supabase
    .from("books")
    .select("id, title, author, cover_path, book_type, created_at")
    .eq("is_curated", true)
    .order("title");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const curatedBooks = (books ?? []).map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    coverUrl:
      book.cover_path && supabaseUrl
        ? `${supabaseUrl}/storage/v1/object/public/covers/${book.cover_path}`
        : null,
    dateAdded: book.created_at ?? "",
    bookType:
      book.book_type === "pdf"
        ? "pdf" as const
        : book.book_type === "epub"
          ? "epub" as const
          : null,
  }));

  const cookieStore = await cookies();
  const initialSortState = getInitialSort(
    cookieStore.get(LIBRARY_SORT_COOKIE)?.value
  );

  return (
    <main className="min-h-screen flex flex-col items-center text-foreground">
      <div className="flex-1 w-full flex flex-col gap-4 items-center">
        <SiteNav
          rightSlot={
            <>
              <Suspense>
                <AuthButton />
              </Suspense>
              <ThemeSwitcher />
            </>
          }
        />

        <div className="flex-1 w-full flex flex-col gap-6 max-w-7xl px-6 pt-2 pb-8 items-center">
        {error ? (
          <Card className="w-full">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">Error loading books: {error.message}</p>
            </CardContent>
          </Card>
        ) : curatedBooks.length === 0 ? (
          <div className="w-full max-w-7xl space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
                  Curated Library
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Public domain books you can read and explore with AI. Sign up to upload your own.
                </p>
              </div>
            </div>
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Curated Library
                </CardTitle>
                <CardDescription>
                  Public domain books available to all readers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground text-center py-8">
                  No curated books yet. Check back later or sign up to upload your own.
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <BrowseCuratedView
            books={curatedBooks}
            initialSort={initialSortState.sort}
            initialDir={initialSortState.dir}
            initialFilter={initialSortState.filter}
          />
        )}
        </div>

        <footer className="w-full flex items-center justify-center border-t border-border mx-auto text-center text-xs gap-8 py-16 text-muted-foreground">
          Minerva Reader
        </footer>
      </div>
    </main>
  );
}
