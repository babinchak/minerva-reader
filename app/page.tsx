import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { BookCard } from "@/components/book-card";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LibraryView } from "@/components/library-view";
import { UpgradeCta } from "@/components/upgrade-cta";
import { HeroReplay } from "@/components/marketing/hero-replay";
import { SiteNav } from "@/components/site-nav";
import { AUTHOR_DELIMITER } from "@/lib/pdf-metadata";
import { createServiceClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpen } from "lucide-react";

function formatAuthorDisplay(author: string | null): string {
  if (!author) return "";
  return author
    .split(AUTHOR_DELIMITER)
    .map((name) => name.trim())
    .filter(Boolean)
    .join(", ");
}

async function SignedOutCuratedPreview() {
  const supabase = createServiceClient();
  const { data: books, error } = await supabase
    .from("books")
    .select("id, title, author, cover_path, book_type, created_at")
    .eq("is_curated", true)
    .order("title")
    .limit(8);

  if (error) {
    return (
      <section className="w-full max-w-7xl rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          Curated books are temporarily unavailable. You can still explore the full
          collection from the browse page.
        </p>
        <div className="mt-4">
          <Link
            href="/browse"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            View curated library
          </Link>
        </div>
      </section>
    );
  }

  if (!books?.length) {
    return null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const curatedBooks = books.map((book) => ({
    id: book.id,
    title: book.title ?? "",
    authorDisplay: formatAuthorDisplay(book.author),
    coverUrl:
      book.cover_path && supabaseUrl
        ? `${supabaseUrl}/storage/v1/object/public/covers/${book.cover_path}`
        : null,
    bookType:
      book.book_type === "pdf"
        ? "pdf" as const
        : book.book_type === "epub"
          ? "epub" as const
          : null,
  }));

  return (
    <section className="w-full max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Start reading now
          </p>
          <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
            Curated Library
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            A small selection of public domain books you can open immediately, with
            your own uploads waiting when you sign up.
          </p>
        </div>
        <Link
          href="/browse"
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          View all curated books
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {curatedBooks.map((book) => (
          <BookCard
            key={book.id}
            id={book.id}
            title={book.title}
            authorDisplay={book.authorDisplay}
            coverUrl={book.coverUrl}
            bookType={book.bookType}
            showRemove={false}
          />
        ))}
      </div>
    </section>
  );
}

async function HomeContent({
  showUpgrade,
}: {
  showUpgrade: boolean;
}) {
  if (!hasEnvVars) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 text-center">
        <BookOpen className="h-16 w-16 text-muted-foreground" />
        <h1 className="max-w-3xl text-4xl font-bold text-foreground">
          <span className="block">Instant answers in context.</span>
          <span className="block">Deep search across the book.</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Highlight any passage for an instant explanation in context, or switch to
          deep mode for broader answers grounded in the book and relevant web
          results.
        </p>
        <Suspense>
          <AuthButton />
        </Suspense>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    return (
      <div className="w-full max-w-7xl space-y-6">
        {showUpgrade && <UpgradeCta />}
        <Suspense>
          <LibraryView />
        </Suspense>
      </div>
    );
  }

  // User is not logged in - show landing page with browse CTA
  return (
    <div className="w-full max-w-7xl space-y-12 sm:space-y-14">
      <section className="w-full rounded-[2rem] border border-border/70 bg-gradient-to-br from-background via-background to-muted/35 px-4 py-6 shadow-sm sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:items-center">
          <div className="space-y-6 text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              <span>Read with context</span>
            </div>
            <div className="space-y-4">
              <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Instant answers in context.
                <span className="block text-muted-foreground">
                  Deep search across the book.
                </span>
              </h1>
              <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                Highlight any passage for an instant explanation in context, or
                switch to deep mode for broader answers grounded in the book and
                relevant web results.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/browse"
                className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Browse curated library
              </Link>
              <Suspense>
                <AuthButton />
              </Suspense>
            </div>
            <p className="max-w-lg text-sm leading-6 text-muted-foreground">
              Sign up to upload your own books, save a personal library, and
              keep every answer anchored to the exact passage you are reading.
            </p>
          </div>

          <HeroReplay />
        </div>
      </section>

      <SignedOutCuratedPreview />
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ upgrade?: string; topup?: string }>;
}) {
  const params = await searchParams;
  const showUpgrade = params.upgrade === "1" || params.topup === "1";

  const freeBetaMode = (() => {
    const v = process.env.FREE_BETA_MODE;
    return !!(v && (v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes"));
  })();

  return (
    <main className="min-h-screen flex flex-col items-center text-foreground">
      <div className="flex-1 w-full flex flex-col gap-4 items-center">
        {freeBetaMode && (
          <div className="w-full bg-primary/10 border-b border-primary/20 py-2 px-4 text-center text-sm text-foreground">
            <strong>Free beta</strong> — Book vectorization and AI usage free during beta.
          </div>
        )}
        <SiteNav
          rightSlot={
            <>
              {!hasEnvVars ? (
                <EnvVarWarning />
              ) : (
                <Suspense>
                  <AuthButton />
                </Suspense>
              )}
              <ThemeSwitcher />
            </>
          }
        />
        <div className="flex-1 w-full flex flex-col gap-6 max-w-7xl px-6 pt-2 pb-8 items-center">
          <Suspense>
            <HomeContent showUpgrade={showUpgrade} />
          </Suspense>
        </div>

        <footer className="w-full flex items-center justify-center border-t border-border mx-auto text-center text-xs gap-8 py-16 text-muted-foreground">
          Minerva Reader
        </footer>
      </div>
    </main>
  );
}
