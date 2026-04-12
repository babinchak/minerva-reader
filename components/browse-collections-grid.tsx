"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LibraryAIAssistant, type AIScope } from "@/components/library-ai-assistant";

interface CollectionItem {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  coverUrl: string | null;
  bookCount: number;
  bookIds: string[];
}

export function BrowseCollectionsGrid({ collections }: { collections: CollectionItem[] }) {
  const allCuratedBookIds = useMemo(
    () => [...new Set(collections.flatMap((c) => c.bookIds))],
    [collections],
  );

  const curatedCollections = useMemo(
    () => collections.filter((c) => c.bookIds.length > 0).map((c) => ({
      id: c.id,
      name: c.name,
      bookCount: c.bookCount,
      bookIds: c.bookIds,
    })),
    [collections],
  );

  const [aiScope, setAiScope] = useState<AIScope>({ type: "curated-library", bookIds: allCuratedBookIds });
  const [aiOpenFromCollection, setAiOpenFromCollection] = useState(false);

  const effectiveBookIds = aiScope.type === "curated-collection"
    ? aiScope.bookIds
    : allCuratedBookIds;

  return (
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
        <LibraryAIAssistant
          bookIds={effectiveBookIds}
          curatedCollections={curatedCollections}
          allCuratedBookIds={allCuratedBookIds}
          aiScope={aiScope}
          onAiScopeChange={setAiScope}
          forceOpen={aiOpenFromCollection}
          onForceOpenConsumed={() => setAiOpenFromCollection(false)}
          buttonLabel="Ask across library"
        />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((c) => (
          <div
            key={c.id}
            className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
          >
            <Link href={`/browse/${c.slug}`} className="relative aspect-[16/9] bg-muted">
              {c.coverUrl ? (
                <img
                  src={c.coverUrl}
                  alt=""
                  className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/60">
                  <BookOpen className="h-10 w-10 text-muted-foreground/50" />
                </div>
              )}
              <span className="absolute bottom-2 right-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm">
                {c.bookCount} book{c.bookCount !== 1 ? "s" : ""}
              </span>
            </Link>
            <div className="flex items-center gap-2 p-4">
              <Link href={`/browse/${c.slug}`} className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                  {c.name}
                </h3>
                {c.description && (
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{c.description}</p>
                )}
              </Link>
              {c.bookIds.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                  onClick={() => {
                    setAiScope({ type: "curated-collection", id: c.id, name: c.name, bookIds: c.bookIds });
                    setAiOpenFromCollection(true);
                  }}
                  aria-label={`Ask AI across ${c.name}`}
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
