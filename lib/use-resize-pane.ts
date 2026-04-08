import { useCallback, useRef, useState, type PointerEvent } from "react";

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Drag-to-resize hook for right-docked panes.
 * @param initial  Starting width in px (default 400)
 * @param min      Minimum width in px (default 280)
 * @param maxVw    Maximum width as fraction of viewport width (default 0.5 = 50vw)
 */
export function useResizePane(initial = 400, min = 280, maxVw = 0.5) {
  const [width, setWidth] = useState(initial);
  const ref = useRef<{ startX: number; startW: number; pid: number } | null>(null);

  const getMax = useCallback(() => Math.round(window.innerWidth * maxVw), [maxVw]);

  const onPointerDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    ref.current = { startX: e.clientX, startW: width, pid: e.pointerId };
  };
  const onPointerMove = (e: PointerEvent) => {
    const r = ref.current;
    if (!r || r.pid !== e.pointerId) return;
    setWidth(clamp(r.startW + (r.startX - e.clientX), min, getMax()));
  };
  const onPointerUp = (e: PointerEvent) => {
    if (ref.current?.pid === e.pointerId) ref.current = null;
  };

  const handleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };

  return { width, handleProps } as const;
}
