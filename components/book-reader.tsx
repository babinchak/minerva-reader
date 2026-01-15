"use client";

import { StatefulReader, StatefulPreferencesProvider, ThStoreProvider, ThI18nProvider } from "@edrlab/thorium-web/epub";
import { useEffect, useState } from "react";
import { TextSelectionHandler } from "@/components/text-selection-handler";
import { AIAgentPane } from "@/components/ai-agent-pane";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";
import { useParams } from "next/navigation";
import { getSelectedText } from "@/lib/book-position-utils";

interface BookReaderProps {
  rawManifest: any;
  selfHref: string;
}

export function BookReader({ rawManifest, selfHref }: BookReaderProps) {
  const [mounted, setMounted] = useState(false);
  const [isAIPaneOpen, setIsAIPaneOpen] = useState(false);
  const [selectedText, setSelectedText] = useState<string>("");
  const params = useParams();
  const bookId = params?.bookId as string;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Listen for text selection events
    const handleSelection = () => {
      setSelectedText(getSelectedText());
    };

    document.addEventListener("selectionchange", handleSelection);
    return () => {
      document.removeEventListener("selectionchange", handleSelection);
    };
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading reader...</p>
        </div>
      </div>
    );
  }

  return (
    <ThStoreProvider>
      <StatefulPreferencesProvider>
        <ThI18nProvider>
          <div className="w-full h-screen flex flex-col">
            <div className="flex flex-1 relative min-h-0">
              {/* Reader Section */}
              <div className={`h-full transition-all duration-300 ${isAIPaneOpen ? "w-[calc(100%-24rem)]" : "w-full"}`}>
                <StatefulReader
                  rawManifest={rawManifest}
                  selfHref={selfHref}
                />
              </div>

              {/* AI Agent Pane */}
              <AIAgentPane
                isOpen={isAIPaneOpen}
                onClose={() => setIsAIPaneOpen(false)}
                selectedText={selectedText}
                bookId={bookId}
                rawManifest={rawManifest}
              />

              {/* Toggle Button */}
              {!isAIPaneOpen && (
                <Button
                  onClick={() => setIsAIPaneOpen(true)}
                  className="fixed top-4 right-4 z-40 shadow-lg"
                  size="icon"
                >
                  <Bot className="h-5 w-5" />
                </Button>
              )}
            </div>

            <TextSelectionHandler rawManifest={rawManifest} bookId={bookId} />
          </div>
        </ThI18nProvider>
      </StatefulPreferencesProvider>
    </ThStoreProvider>
  );
}
