"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";
import { AIAgentPanel } from "@/components/ai-agent-pane";
import { useIsMobile } from "@/lib/use-media-query";

interface LibraryAIAssistantProps {
  bookIds: string[];
}

export function LibraryAIAssistant({ bookIds }: LibraryAIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();

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
          Ask across library
        </Button>
      )}
      {isOpen && (
        <div className="fixed top-0 right-0 z-50 h-full w-[400px] border-l border-border bg-background shadow-lg flex flex-col">
          <AIAgentPanel
            bookIds={bookIds}
            className="h-full w-full flex flex-col min-w-0"
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}
    </>
  );
}
