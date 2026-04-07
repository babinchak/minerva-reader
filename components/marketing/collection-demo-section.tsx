"use client";

import { useState } from "react";
import { CollectionCard } from "@/components/collection-card";
import { DemoAIPanel } from "@/components/demo-ai-panel";
import { DEMO_DATA } from "@/lib/demo-chat-data";

interface CollectionInfo {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  coverUrl: string | null;
  bookCount: number;
}

export function CollectionDemoSection({
  collections,
}: {
  collections: CollectionInfo[];
}) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const activeEntries = activeSlug ? DEMO_DATA[activeSlug] : undefined;

  return (
    <>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((c) => {
          const entries = DEMO_DATA[c.slug];
          const hasDemo = entries && entries.length > 0;

          return (
            <div key={c.id} className="space-y-3">
              <CollectionCard
                name={c.name}
                description={c.description}
                slug={c.slug}
                coverUrl={c.coverUrl}
                bookCount={c.bookCount}
              />
              {hasDemo && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground px-1">
                    Try asking Minerva:
                  </p>
                  {entries.map((entry) => (
                    <button
                      key={entry.question}
                      type="button"
                      onClick={() => setActiveSlug(c.slug)}
                      className="w-full text-left rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm transition-colors hover:bg-accent hover:border-accent-foreground/20"
                    >
                      {entry.question}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Docked right-side AI pane — matches library AI assistant */}
      {activeSlug && activeEntries && activeEntries.length > 0 && (
        <div className="!mt-0 fixed top-0 right-0 z-50 h-full w-[400px] border-l border-border bg-background shadow-lg flex flex-col">
          <DemoAIPanel
            demoEntries={activeEntries}
            onClose={() => setActiveSlug(null)}
            className="h-full w-full flex flex-col min-w-0"
          />
        </div>
      )}
    </>
  );
}
