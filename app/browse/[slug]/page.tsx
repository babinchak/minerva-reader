import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { ServerSiteNav } from "@/components/server-site-nav";
import { hasEnvVars } from "@/lib/utils";
import { EnvVarWarning } from "@/components/env-var-warning";
import { BookCard } from "@/components/book-card";
import { SiteFooter } from "@/components/site-footer";
import { MinervaLogo } from "@/components/minerva-logo";
import { AUTHOR_DELIMITER } from "@/lib/pdf-metadata";
import { CuratedCollectionAI } from "@/components/curated-collection-ai";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatAuthorDisplay(author: string | null): string {
  if (!author) return "";
  return author.split(AUTHOR_DELIMITER).map((a) => a.trim()).filter(Boolean).join(", ");
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function BrowseCollectionPage({ params }: PageProps) {
  const { slug } = await params;

  if (!hasEnvVars) {
    return (
      <main className="min-h-screen flex flex-col items-center text-foreground">
        <ServerSiteNav rightSlot={<><EnvVarWarning /><ThemeSwitcher /></>} />
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-muted-foreground">Configure environment variables to continue.</p>
        </div>
      </main>
    );
  }

  const supabase = createServiceClient();
  const userSupabase = await createClient();
  const { data: { user } } = await userSupabase.auth.getUser();

  // Fetch collection by slug
  const { data: collection, error: collError } = await supabase
    .from("curated_collections")
    .select("id, name, description, slug")
    .eq("slug", slug)
    .single();

  if (collError || !collection) {
    notFound();
  }

  // Fetch books in collection
  const { data: rows, error: booksError } = await supabase
    .from("curated_collection_books")
    .select("book_id, sort_order, books(id, title, author, cover_path, book_type, created_at)")
    .eq("curated_collection_id", collection.id)
    .order("sort_order");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const books = (rows ?? []).map((r) => {
    const book = (r as any).books;
    return {
      id: book?.id ?? r.book_id,
      title: book?.title ?? null,
      author: book?.author ?? null,
      coverUrl:
        book?.cover_path && supabaseUrl
          ? `${supabaseUrl}/storage/v1/object/public/covers/${book.cover_path}`
          : null,
      bookType:
        book?.book_type === "pdf"
          ? "pdf" as const
          : book?.book_type === "epub"
            ? "epub" as const
            : null,
    };
  });

  return (
    <main className="min-h-screen flex flex-col items-center text-foreground">
      <div className="flex-1 w-full flex flex-col gap-4 items-center">
        <ServerSiteNav
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
          <div className="w-full max-w-7xl space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Link
                  href="/browse"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  &larr; All Collections
                </Link>
                <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
                  {collection.name}
                </h1>
                {collection.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {collection.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/"
                  className="inline-flex rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  Library
                </Link>
                {user && books.length > 0 && (
                  <CuratedCollectionAI
                    collectionName={collection.name}
                    bookIds={books.map((b) => b.id)}
                  />
                )}
              </div>
            </div>

            {booksError ? (
              <p className="text-sm text-destructive">Error loading books: {booksError.message}</p>
            ) : books.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {books.map((book) => (
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
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 flex flex-col items-center gap-4 text-center">
                <MinervaLogo size={48} />
                <p className="text-sm text-muted-foreground">No books in this collection yet.</p>
              </div>
            )}

          </div>
        </div>

        <SiteFooter className="py-16" />
      </div>
    </main>
  );
}
