"use client";

import { useEffect, useRef, useState } from "react";
import { Undo2, X } from "lucide-react";
import { hapticLight, hapticSnap } from "@/lib/haptic";

interface ReadingAnchorPillProps {
  /** e.g. "page 42" or "previous position" */
  label: string;
  /** Parent controls visibility (e.g. chromeVisible && anchor exists) */
  visible: boolean;
  /** Auto-hide after this many ms (0 or omit = stay visible) */
  autoHideMs?: number;
  /** Extra top offset in px beyond safe-area-inset-top (default 8) */
  topOffset?: number;
  onReturn: () => void;
  onDismiss: () => void;
}

export function ReadingAnchorPill({
  label,
  visible,
  autoHideMs,
  topOffset = 8,
  onReturn,
  onDismiss,
}: ReadingAnchorPillProps) {
  const [autoHidden, setAutoHidden] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (visible && autoHideMs) {
      setAutoHidden(false);
      timerRef.current = setTimeout(() => setAutoHidden(true), autoHideMs);
    } else if (visible) {
      setAutoHidden(false);
    }
    return () => clearTimeout(timerRef.current);
  }, [visible, autoHideMs]);

  const shown = visible && !autoHidden;

  return (
    <div
      className={[
        "absolute left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 rounded-full",
        "border border-border/60 bg-background/90 backdrop-blur px-3 py-1.5 shadow-lg",
        "transition-all duration-300 select-none",
        shown
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 -translate-y-2 pointer-events-none",
      ].join(" ")}
      style={{ top: `calc(env(safe-area-inset-top, 0px) + ${topOffset}px)` }}
    >
      <button
        type="button"
        onClick={() => {
          hapticSnap();
          onReturn();
        }}
        className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors"
      >
        <Undo2 className="h-3.5 w-3.5" />
        <span>Back to {label}</span>
      </button>
      <button
        type="button"
        onClick={() => {
          hapticLight();
          onDismiss();
        }}
        className="text-muted-foreground hover:text-foreground transition-colors ml-0.5 p-0.5"
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
