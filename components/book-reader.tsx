"use client";

import { StatefulReader, StatefulPreferencesProvider, ThStoreProvider, ThI18nProvider } from "@edrlab/thorium-web/epub";
import { useEffect, useState } from "react";
import { TextSelectionHandler } from "@/components/text-selection-handler";
import { AIAssistant } from "@/components/ai-assistant";
import { useParams } from "next/navigation";
import { useSelectedText } from "@/lib/use-selected-text";

interface BookReaderProps {
  rawManifest: { readingOrder?: Array<{ href?: string }> };
  selfHref: string;
}

export function BookReader({ rawManifest, selfHref }: BookReaderProps) {
  const [mounted, setMounted] = useState(false);
  const selectedText = useSelectedText();
  const params = useParams();
  const bookId = params?.bookId as string;

  useEffect(() => {
    setMounted(true);
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
              <div className="h-full w-full">
                <StatefulReader rawManifest={rawManifest} selfHref={selfHref} />
              </div>
              <AIAssistant
                selectedText={selectedText}
                bookId={bookId}
                rawManifest={rawManifest}
                bookType="epub"
              />
            </div>

            <TextSelectionHandler rawManifest={rawManifest} bookId={bookId} />
          </div>
        </ThI18nProvider>
      </StatefulPreferencesProvider>
    </ThStoreProvider>
  );
}
