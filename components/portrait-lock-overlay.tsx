"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useIsMobile } from "@/lib/use-media-query";

/**
 * Displays a full-screen overlay on mobile devices in landscape orientation,
 * prompting the user to rotate back to portrait. Also attempts to lock
 * orientation via the Screen Orientation API (works on Android PWA; Safari
 * ignores it, so the visual overlay is the fallback).
 */
export function PortraitLockOverlay() {
  const isMobile = useIsMobile();
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    // Try to lock orientation via API (Android Chrome / installed PWA)
    try {
      const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      so.lock?.("portrait")?.catch(() => {
        // Silently fail — Safari and non-PWA contexts don't support this
      });
    } catch {
      // lock() not available
    }

    const query = window.matchMedia("(orientation: landscape)");
    setIsLandscape(query.matches);

    const handler = (e: MediaQueryListEvent) => setIsLandscape(e.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  if (!isMobile || !isLandscape) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-background text-foreground">
      <RotateCcw className="h-12 w-12 animate-pulse" />
      <p className="text-lg font-medium">Please rotate your device</p>
      <p className="text-sm text-muted-foreground">
        This reader works best in portrait mode
      </p>
    </div>
  );
}
