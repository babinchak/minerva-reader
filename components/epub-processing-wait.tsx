"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, BookOpen } from "lucide-react";

/**
 * Shown when an EPUB's manifest isn't ready yet (still processing).
 * Auto-refreshes the page every 5 seconds until the manifest is available.
 */
export function EpubProcessingWait({ bookTitle }: { bookTitle: string }) {
  const router = useRouter();
  const [dots, setDots] = useState("");

  useEffect(() => {
    // Animate dots
    const dotInterval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 500);

    // Auto-refresh every 5 seconds
    const refreshInterval = setInterval(() => {
      router.refresh();
    }, 5000);

    return () => {
      clearInterval(dotInterval);
      clearInterval(refreshInterval);
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
        <div className="relative">
          <BookOpen className="h-12 w-12 text-muted-foreground" />
          <Loader2 className="absolute -bottom-1 -right-1 h-5 w-5 animate-spin text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Preparing your book{dots}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{bookTitle}</span> is
            being processed. This usually takes less than a minute.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          This page will update automatically when ready.
        </p>
      </div>
    </div>
  );
}
