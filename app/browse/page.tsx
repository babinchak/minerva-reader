import type { Metadata } from "next";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { AuthButton } from "@/components/auth-button";
import { ServerSiteNav } from "@/components/server-site-nav";
import { hasEnvVars } from "@/lib/utils";
import { EnvVarWarning } from "@/components/env-var-warning";
import { Suspense } from "react";
import { CollectionCard } from "@/components/collection-card";
import { BrowseCollectionsGrid } from "@/components/browse-collections-grid";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Explore - Minerva Reader",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BrowsePage() {
  if (!hasEnvVars) {
    return (
      <main className="min-h-screen flex flex-col items-center text-foreground">
        <ServerSiteNav rightSlot={<EnvVarWarning />} />
        <div className="flex-1 flex items-center justify-center p-8">
          <p className="text-muted-foreground">Configure environment variables to continue.</p>
        </div>
      </main>
    );
  }

  const supabase = createServiceClient();
  const userSupabase = await createClient();
  const { data: { user } } = await userSupabase.auth.getUser();

  const { data: collections, error } = await supabase
    .from("curated_collections")
    .select("id, name, description, slug, cover_image_path, sort_order, curated_collection_books(count)")
    .order("sort_order");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const collectionIds = (collections ?? []).map((c) => c.id);

  // Fetch book IDs per curated collection for AI (only when logged in)
  let bookIdsByCollection: Record<string, string[]> = {};
  if (user && collectionIds.length > 0) {
    const { data: allRows } = await supabase
      .from("curated_collection_books")
      .select("curated_collection_id, book_id")
      .in("curated_collection_id", collectionIds);
    for (const row of allRows ?? []) {
      const cid = row.curated_collection_id;
      if (!bookIdsByCollection[cid]) bookIdsByCollection[cid] = [];
      bookIdsByCollection[cid].push(row.book_id);
    }
  }

  const collectionCards = (collections ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    slug: c.slug,
    coverUrl:
      c.cover_image_path && supabaseUrl
        ? `${supabaseUrl}/storage/v1/object/public/covers/${c.cover_image_path}`
        : null,
    bookCount: (c as any).curated_collection_books?.[0]?.count ?? 0,
    bookIds: bookIdsByCollection[c.id] ?? [],
  }));

  return (
    <main className="min-h-screen flex flex-col items-center text-foreground">
      <div className="flex-1 w-full flex flex-col gap-4 items-center">
        <ServerSiteNav
          rightSlot={
            <Suspense>
              <AuthButton />
            </Suspense>
          }
        />

        <div className="flex-1 w-full flex flex-col gap-6 max-w-7xl px-6 pt-2 pb-8 items-center">
          {error ? (
            <Card className="w-full">
              <CardContent className="pt-6">
                <p className="text-sm text-destructive">Error loading collections: {error.message}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="w-full max-w-7xl space-y-6">
              {collectionCards.length > 0 ? (
                user ? (
                  <BrowseCollectionsGrid collections={collectionCards} />
                ) : (
                  <>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
                          Curated Library
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Explore curated collections of public domain books you can read and discuss with AI.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      {collectionCards.map((c) => (
                        <CollectionCard
                          key={c.id}
                          name={c.name}
                          description={c.description}
                          slug={c.slug}
                          coverUrl={c.coverUrl}
                          bookCount={c.bookCount}
                        />
                      ))}
                    </div>
                  </>
                )
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    No collections yet. Check back soon!
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <SiteFooter className="py-16" />
      </div>
    </main>
  );
}
