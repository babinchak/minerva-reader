"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIAgentPanel } from "@/components/ai-agent-pane";
import { useResizePane } from "@/lib/use-resize-pane";
import type { AIScope } from "@/components/library-ai-assistant";

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
  const [aiCollection, setAiCollection] = useState<CollectionItem | null>(null);
  const { width: paneWidth, handleProps } = useResizePane();

  const scope: AIScope | undefined = aiCollection
    ? { type: "collection", id: aiCollection.id, name: aiCollection.name, bookIds: aiCollection.bookIds }
    : undefined;

  return (
    <>
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
                  onClick={() => setAiCollection(c)}
                  aria-label={`Ask AI across ${c.name}`}
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {aiCollection && scope && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-y-0 right-0 z-[60] border-l border-border bg-background shadow-lg flex flex-col"
            style={{ width: `${paneWidth}px` }}
          >
            <div
              className="absolute -left-1 top-0 h-full w-2 cursor-col-resize touch-none z-50"
              {...handleProps}
              aria-label="Resize AI panel"
              role="separator"
              aria-orientation="vertical"
            />
            <AIAgentPanel
              bookIds={aiCollection.bookIds}
              aiScope={scope}
              onAiScopeChange={() => {}}
              className="h-full w-full flex flex-col min-w-0"
              onClose={() => setAiCollection(null)}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
