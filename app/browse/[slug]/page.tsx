import type { Metadata } from "next";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { ServerSiteNav } from "@/components/server-site-nav";
import { hasEnvVars } from "@/lib/utils";
import { EnvVarWarning } from "@/components/env-var-warning";
import { SiteFooter } from "@/components/site-footer";
import { SearchableBookGrid } from "@/components/searchable-book-grid";
import { CuratedCollectionAI } from "@/components/curated-collection-ai";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("curated_collections")
    .select("name")
    .eq("slug", slug)
    .single();
  return { title: data?.name ? `${data.name} - Minerva Reader` : "Explore - Minerva Reader" };
}

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ prefill?: string; openChat?: string }>;
}

export default async function BrowseCollectionPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const prefillQuestion = sp.prefill ?? null;
  const shouldOpenChat = sp.openChat === "1";

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

  // Fetch the user's library book IDs so we can show "already in library" state
  let userLibraryBookIds: string[] = [];
  if (user) {
    const { data: userBooks } = await supabase
      .from("user_books")
      .select("book_id")
      .eq("user_id", user.id);
    userLibraryBookIds = (userBooks ?? []).map((ub) => ub.book_id);
  }

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
              {user && books.length > 0 && (
                <CuratedCollectionAI
                  collectionName={collection.name}
                  bookIds={books.map((b) => b.id)}
                  prefillQuestion={prefillQuestion}
                  forceOpen={shouldOpenChat}
                />
              )}
            </div>

            {booksError ? (
              <p className="text-sm text-destructive">Error loading books: {booksError.message}</p>
            ) : (
              <SearchableBookGrid
                books={books}
                showAddToLibrary={!!user}
                userLibraryBookIds={userLibraryBookIds}
              />
            )}

          </div>
        </div>

        <SiteFooter className="py-16" />
      </div>
    </main>
  );
}
