"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";
import { AIAgentPanel } from "@/components/ai-agent-pane";
import { useIsMobile } from "@/lib/use-media-query";
import { useResizePane } from "@/lib/use-resize-pane";
import type { CollectionSummary } from "@/components/collections-view";

export type AIScope =
  | { type: "library" }
  | { type: "collection"; id: string; name: string; bookIds: string[] };

interface LibraryAIAssistantProps {
  bookIds: string[];
  collections?: CollectionSummary[];
  aiScope?: AIScope;
  onAiScopeChange?: (scope: AIScope) => void;
  /** When true, force open the AI pane (e.g. from a collection AI button). */
  forceOpen?: boolean;
  onForceOpenConsumed?: () => void;
  /** Custom label for the trigger button. Defaults to "Ask across library". */
  buttonLabel?: string;
}

export function LibraryAIAssistant({
  bookIds,
  collections,
  aiScope,
  onAiScopeChange,
  forceOpen,
  onForceOpenConsumed,
  buttonLabel = "Ask across library",
}: LibraryAIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();
  const { width: paneWidth, handleProps } = useResizePane();

  // Handle force open from collection AI button
  useEffect(() => {
    if (forceOpen && !isOpen) {
      setIsOpen(true);
      onForceOpenConsumed?.();
    }
  }, [forceOpen, isOpen, onForceOpenConsumed]);

  if (bookIds.length === 0) return null;

  if (isMobile) {
    return (
      <>
        {!isOpen && (
          <Button
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
            size="icon"
            aria-label="Search across library with AI"
          >
            <Sparkles className="h-6 w-6" />
          </Button>
        )}
        {isOpen && (
          <div className="fixed inset-0 z-50 flex flex-col bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-blue-500" />
                Library AI
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <AIAgentPanel
              bookIds={bookIds}
              collections={collections}
              aiScope={aiScope}
              onAiScopeChange={onAiScopeChange}
              className="flex-1 flex flex-col min-h-0"
              showHeader={false}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          variant="outline"
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          {buttonLabel}
        </Button>
      )}
      {isOpen && (
        <div
          className="fixed top-0 right-0 z-50 h-full border-l border-border bg-background shadow-lg flex flex-col"
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
            bookIds={bookIds}
            collections={collections}
            aiScope={aiScope}
            onAiScopeChange={onAiScopeChange}
            className="h-full w-full flex flex-col min-w-0"
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}
    </>
  );
}
