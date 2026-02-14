"use client";

import { StatefulReader, StatefulPreferencesProvider, ThStoreProvider, ThI18nProvider } from "@edrlab/thorium-web/epub";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TextSelectionHandler } from "@/components/text-selection-handler";
import { AIAssistant } from "@/components/ai-assistant";
import { useParams } from "next/navigation";
import { useSelectedText } from "@/lib/use-selected-text";

const EPUB_STORAGE_KEY_SUFFIX = "-current-location";

interface BookReaderProps {
  rawManifest: { readingOrder?: Array<{ href?: string }> };
  selfHref: string;
  initialReadingPosition?: Record<string, unknown> | null;
}

export function BookReader({ rawManifest, selfHref, initialReadingPosition }: BookReaderProps) {
  const [mounted, setMounted] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const selectedText = useSelectedText();
  const params = useParams();
  const bookId = params?.bookId as string;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Pre-populate localStorage with saved position before Thorium reads it
  useLayoutEffect(() => {
    if (initialReadingPosition && typeof window !== "undefined") {
      try {
        const key = `${selfHref}${EPUB_STORAGE_KEY_SUFFIX}`;
        localStorage.setItem(key, JSON.stringify(initialReadingPosition));
      } catch {
        // Ignore localStorage errors
      }
    }
    setStorageReady(true);
  }, [selfHref, initialReadingPosition]);

  if (!mounted || !storageReady) {
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
            <EpubPositionSync bookId={bookId} storageKey={`${selfHref}${EPUB_STORAGE_KEY_SUFFIX}`} />
          </div>
        </ThI18nProvider>
      </StatefulPreferencesProvider>
    </ThStoreProvider>
  );
}

/** Syncs EPUB reading position from localStorage (written by Thorium) to our API */
function EpubPositionSync({ bookId, storageKey }: { bookId: string; storageKey: string }) {
  const lastSavedRef = useRef<string | null>(null);
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return;
        if (raw === lastSavedRef.current) return;
        lastSavedRef.current = raw;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed?.href) return;
        fetch(`/api/books/${bookId}/reading-position`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ readingPosition: parsed }),
        }).catch(() => {});
      } catch {
        // Ignore parse errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [bookId, storageKey]);
  return null;
}
