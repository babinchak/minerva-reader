"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AIAgentPanel, type AIAgentPanelProps } from "@/components/ai-agent-pane";

type MobileDrawerMode = "closed" | "quick" | "half" | "full";

export interface AIBottomDrawerProps
  extends Omit<
    AIAgentPanelProps,
    | "className"
    | "showHeader"
    | "showMessages"
    | "showSelectedTextBanner"
    | "showSelectionChip"
    | "onClose"
  > {
  /**
   * Optional initial mode (mostly for debugging).
   */
  initialMode?: MobileDrawerMode;
  /**
   * Prevent the drawer from being fully closed. "quick" keeps the input visible.
   * Defaults to "quick" so users can always access the AI.
   */
  minMode?: Extract<MobileDrawerMode, "closed" | "quick">;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Velocity threshold (px/ms) above which we snap in the fling direction. */
const VELOCITY_THRESHOLD = 0.3;

/** Transition duration for snap animation (ms). */
const SNAP_DURATION_MS = 280;

export function AIBottomDrawer({
  selectedText,
  initialMode,
  minMode = "quick",
  ...panelProps
}: AIBottomDrawerProps) {
  const selectionExists = Boolean(selectedText && selectedText.trim().length > 0);

  const [mode, setMode] = useState<MobileDrawerMode>(() => {
    if (initialMode) return initialMode;
    if (minMode === "quick") return "quick";
    return selectionExists ? "quick" : "closed";
  });

  // Keep mode in sync with selection for the closed/quick behaviors.
  useEffect(() => {
    setMode((prev) => {
      if (selectionExists && prev === "closed") return "quick";
      if (!selectionExists && prev === "quick") return minMode === "quick" ? "quick" : "closed";
      return prev;
    });
  }, [minMode, selectionExists]);

  const handleHeight = 24;
  /** Tighter fit: handle + input row + padding (no chip on mobile) */
  const quickHeightBase = 96;
  /** When selection exists, Explain button appears above input – need extra height */
  const quickHeightWithSelection = 144;
  const quickHeight = selectionExists ? quickHeightWithSelection : quickHeightBase;

  const heights = useMemo(() => {
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const qh = selectionExists ? quickHeightWithSelection : quickHeightBase;
    return {
      closed: handleHeight,
      quick: qh,
      half: Math.round(vh * 0.55),
      full: vh, // Full viewport – covers toolbar for max AI real estate
    } satisfies Record<MobileDrawerMode, number>;
  }, [selectionExists]);

  const [heightPx, setHeightPx] = useState<number>(() => {
    if (typeof window === "undefined") return heights.closed;
    return heights[mode];
  });

  const [isDragging, setIsDragging] = useState(false);

  // Update height when mode changes, viewport changes, or selection (affects quick height).
  useEffect(() => {
    const update = () => {
      const vh = window.innerHeight;
      const qh = selectionExists ? quickHeightWithSelection : quickHeightBase;
      const newHeights = {
        closed: handleHeight,
        quick: qh,
        half: Math.round(vh * 0.55),
        full: vh,
      } satisfies Record<MobileDrawerMode, number>;
      setHeightPx(newHeights[mode]);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [mode, selectionExists]);

  const draggingRef = useRef<{
    startY: number;
    startHeight: number;
    pointerId: number;
    velocitySamples: Array<{ y: number; t: number }>;
  } | null>(null);

  const didDragRef = useRef(false);

  const maxHeight = typeof window !== "undefined" ? window.innerHeight : 900;
  const minHeight = handleHeight;

  /** Ordered snap points (closed/quick depending on min, then half, full). */
  const snapPoints = useMemo(() => {
    const min = selectionExists || minMode === "quick" ? "quick" : "closed";
    const order: MobileDrawerMode[] = ["closed", "quick", "half", "full"];
    const startIdx = order.indexOf(min);
    return order.slice(startIdx) as MobileDrawerMode[];
  }, [selectionExists, minMode]);

  const snapToMode = useCallback(
    (currentHeight: number, velocityY: number) => {
      const vh = window.innerHeight;
      const h = {
        closed: handleHeight,
        quick: quickHeight,
        half: Math.round(vh * 0.55),
        full: vh,
      };

      const points = snapPoints.map((m) => ({ mode: m, height: h[m] }));

      // Velocity: positive = dragging down (finger moving down), negative = dragging up
      const flingDown = velocityY > VELOCITY_THRESHOLD;
      const flingUp = velocityY < -VELOCITY_THRESHOLD;

      let target: { mode: MobileDrawerMode; height: number };

      if (flingDown || flingUp) {
        // Find which snap band we're in (for velocity-based direction)
        let idx = 0;
        for (let i = 0; i < points.length; i++) {
          if (currentHeight < points[i].height) break;
          idx = i;
        }
        if (flingDown) idx = Math.max(0, idx - 1);
        else idx = Math.min(points.length - 1, idx + 1);
        target = points[idx];
      } else {
        // Snap to nearest
        target = points[0];
        for (const p of points) {
          if (Math.abs(p.height - currentHeight) < Math.abs(target.height - currentHeight)) {
            target = p;
          }
        }
      }

      setMode(target.mode);
    },
    [snapPoints]
  );

  const onHandlePointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    didDragRef.current = false;
    setIsDragging(true);
    draggingRef.current = {
      startY: e.clientY,
      startHeight: heightPx,
      pointerId: e.pointerId,
      velocitySamples: [{ y: e.clientY, t: performance.now() }],
    };
  };

  const onHandlePointerMove = (e: React.PointerEvent) => {
    const drag = draggingRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    didDragRef.current = true;
    const delta = drag.startY - e.clientY; // up = positive
    const next = clamp(drag.startHeight + delta, minHeight, maxHeight);
    setHeightPx(next);

    // Track velocity (keep last ~100ms of samples)
    const samples = drag.velocitySamples;
    samples.push({ y: e.clientY, t: performance.now() });
    const cutoff = performance.now() - 100;
    while (samples.length > 2 && samples[1].t < cutoff) samples.shift();
  };

  const onHandlePointerUp = (e: React.PointerEvent) => {
    const drag = draggingRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const samples = drag.velocitySamples;
    let velocityY = 0;
    if (samples.length >= 2) {
      const recent = samples[samples.length - 1];
      const older = samples[0];
      const dt = recent.t - older.t;
      if (dt > 0) {
        velocityY = (recent.y - older.y) / dt; // positive = finger moving down
      }
    }

    draggingRef.current = null;
    setIsDragging(false);
    snapToMode(heightPx, velocityY);
  };

  const close = () => setMode(selectionExists || minMode === "quick" ? "quick" : "closed");

  const showBackdrop = mode === "half" || mode === "full" || (isDragging && heightPx > quickHeight);

  // Backdrop opacity: interpolate during drag, full when snapped to half/full
  const backdropOpacity = (() => {
    if (mode === "half" || mode === "full") return 0.3;
    if (isDragging && heightPx > quickHeight) {
      const range = heights.full - quickHeight;
      return Math.min(0.3, ((heightPx - quickHeight) / range) * 0.3);
    }
    return 0.3;
  })();

  const panelVisibility = (() => {
    if (mode === "closed") {
      return { showHeader: false, showMessages: false, showChip: false };
    }
    if (mode === "quick") {
      return { showHeader: false, showMessages: false, showChip: false };
    }
    if (mode === "half") {
      return { showHeader: true, showMessages: true, showChip: false };
    }
    return { showHeader: true, showMessages: true, showChip: false };
  })();

  return (
    <>
      {showBackdrop && (
        <button
          type="button"
          aria-label="Close AI assistant"
          onClick={close}
          className="fixed inset-0 z-40"
          style={{ backgroundColor: `rgba(0,0,0,${backdropOpacity})` }}
        />
      )}

      <div
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          height: `${heightPx}px`,
          transition: isDragging ? "none" : `height ${SNAP_DURATION_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        }}
      >
        <div className="h-full w-full rounded-t-2xl border-t border-border bg-background shadow-2xl flex flex-col overflow-hidden min-h-0">
          {/* Pill / handle */}
          <div
            className="h-6 flex items-center justify-center touch-none"
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerUp}
            role="button"
            tabIndex={0}
            aria-label="Drag to open AI assistant"
            onClick={() => {
              if (didDragRef.current) return;
              // Tap to expand to half.
              if (mode === "closed") setMode(selectionExists ? "quick" : "half");
              else if (mode === "quick") setMode("half");
            }}
          >
            <div className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
          </div>

          {mode !== "closed" && (
            <AIAgentPanel
              {...panelProps}
              selectedText={selectedText}
              includeSelectionContextOnSend={true}
              showHeader={panelVisibility.showHeader}
              showMessages={panelVisibility.showMessages}
              showSelectedTextBanner={false}
              showSelectionChip={panelVisibility.showChip}
              onClose={close}
              onActionStart={() => {
                // When user sends a message (Explain selection, typed question, etc.), expand to full so they can see the response.
                if (mode === "quick" || mode === "half") setMode("full");
              }}
              className="flex-1 flex flex-col min-h-0"
            />
          )}
        </div>
      </div>
    </>
  );
}

