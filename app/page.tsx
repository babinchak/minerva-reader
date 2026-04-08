import { EnvVarWarning } from "@/components/env-var-warning";
import { SiteFooter } from "@/components/site-footer";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LibraryView } from "@/components/library-view";
import { UpgradeCta } from "@/components/upgrade-cta";
import { HeroReplay } from "@/components/marketing/hero-replay";
import { ServerSiteNav } from "@/components/server-site-nav";
import { LibraryPageSkeleton } from "@/components/library-grid-skeleton";
import { HomeContentSkeleton } from "@/components/home-content-skeleton";
import { ResponseWall } from "@/components/marketing/response-wall";
import { LandingSearch } from "@/components/marketing/landing-search";
import { createServiceClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Suspense } from "react";
import Image from "next/image";
import { MinervaLogo } from "@/components/minerva-logo";

/** Fetch a small batch of full demo responses for the response wall seed. */
async function fetchResponseWallSeed(limit = 15) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("collection_demos")
    .select("id, question, tool_calls, answer, books, curated_collections!inner(name, slug)")
    .limit(limit);

  if (error || !data?.length) return [];

  return (data as any[]).map((d) => ({
    id: d.id as string,
    question: d.question as string,
    toolCalls: (d.tool_calls ?? []) as { toolName: string; args: Record<string, unknown> }[],
    answer: d.answer as string,
    books: (d.books ?? {}) as Record<string, { bookId: string; bookLabel: string; bookType: string | null }>,
    collectionName: d.curated_collections?.name ?? "",
    collectionSlug: d.curated_collections?.slug ?? "",
  }));
}

async function fetchCollectionCards() {
  const supabase = createServiceClient();
  // Only fetch demo questions (no answer/books/tool_calls) — full data loaded on demand
  const { data: collections, error } = await supabase
    .from("curated_collections")
    .select("id, name, description, slug, cover_image_path, sort_order, curated_collection_books(count), collection_demos(id, question, sort_order)")
    .order("sort_order");

  if (error || !collections?.length) return [];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return collections.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    slug: c.slug,
    coverUrl:
      c.cover_image_path && supabaseUrl
        ? `${supabaseUrl}/storage/v1/object/public/covers/${c.cover_image_path}`
        : null,
    bookCount: (c as any).curated_collection_books?.[0]?.count ?? 0,
    demos: (((c as any).collection_demos ?? []) as { id: string; question: string; sort_order: number }[])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((d: any) => ({
        id: d.id as string,
        question: d.question as string,
      })),
  }));
}

async function HomeContent({
  showUpgrade,
}: {
  showUpgrade: boolean;
}) {
  if (!hasEnvVars) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 text-center">
        <MinervaLogo size={96} variant="large" />
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
        <Suspense fallback={<LibraryPageSkeleton />}>
          <LibraryView />
        </Suspense>
      </div>
    );
  }

  // User is not logged in — fetch collection data for landing page
  const [cards, wallSeed] = await Promise.all([
    fetchCollectionCards(),
    fetchResponseWallSeed(),
  ]);

  return (
    <div className="w-full max-w-7xl space-y-16 sm:space-y-20">
      {/* 1. Hero headline + search box — the main event */}
      <section className="flex flex-col items-center pt-8 sm:pt-12">
        <div className="mb-2">
          <Image
            src="/hero-owl.png"
            alt="Minerva Reader"
            width={120}
            height={120}
            className="rounded-lg"
            priority
          />
        </div>
        <h1 className="max-w-3xl text-center text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          Your books, answered.
        </h1>
        <p className="mt-4 max-w-2xl text-center text-base text-muted-foreground sm:text-lg">
          Upload books, build collections, and get answers traced back to the
          exact passage — with references you can click and verify.
        </p>
        <p className="mt-2 text-center text-sm text-muted-foreground/70">
          150,000+ passages indexed and searchable
        </p>

        <div className="mt-8 w-full">
          <LandingSearch collections={cards} />
        </div>
      </section>

      {/* 2. Response wall — social proof / depth showcase */}
      {wallSeed.length > 0 && (
        <section className="w-full max-w-7xl space-y-5">
          <ResponseWall seed={wallSeed} />
        </section>
      )}

      {/* 3. In-book demo — shows the reading experience */}
      <section className="w-full rounded-[2rem] border border-border/70 bg-gradient-to-br from-background via-background to-muted/35 px-4 py-6 shadow-sm sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:items-center">
          <div className="space-y-6 text-left">
            <div className="space-y-4">
              <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                <span className="block">Select any passage.</span>
                <span className="mt-2 block text-muted-foreground">
                  Get an instant explanation in context.
                </span>
              </h2>
              <p className="max-w-xl text-base leading-7 text-muted-foreground">
                Highlight text for a quick explanation, or switch to Deep mode
                for agentic search across every section of the book.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/browse"
                className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Explore curated library
              </Link>
              <Suspense>
                <AuthButton />
              </Suspense>
            </div>
            <p className="max-w-lg text-sm leading-6 text-muted-foreground">
              Sign up to upload your own books and build a personal library.
            </p>
          </div>

          <HeroReplay />
        </div>
      </section>
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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen flex flex-col items-center text-foreground">
        <div className="flex-1 w-full flex flex-col gap-4 items-center">
        {freeBetaMode && (
          <div className="w-full bg-primary/10 border-b border-primary/20 py-2 px-4 text-center text-sm text-foreground">
            <strong>Free beta</strong> — Book vectorization and AI usage free during beta.
          </div>
        )}
        <ServerSiteNav
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
          <Suspense fallback={<HomeContentSkeleton />}>
            <HomeContent showUpgrade={showUpgrade} />
          </Suspense>
        </div>

        <SiteFooter className="py-16" />
        </div>
    </main>
  );
}
