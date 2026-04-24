"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

/**
 * Responsive breakpoint config: [minViewportWidth, columnCount]
 * Ordered largest-first so the first match wins.
 * Uses viewport width (like Tailwind) not container width.
 */
export type ColumnBreakpoints = [number, number][];

const LIBRARY_BREAKPOINTS: ColumnBreakpoints = [
  [1280, 6], // xl
  [1024, 5], // lg
  [768, 4],  // md
  [640, 3],  // sm
  [0, 2],    // default
];

const BROWSE_BREAKPOINTS: ColumnBreakpoints = [
  [1024, 5], // lg
  [768, 4],
  [640, 3],
  [0, 2],
];

export { LIBRARY_BREAKPOINTS, BROWSE_BREAKPOINTS };

const GAP = 16; // gap-4 = 1rem = 16px

function getColumns(breakpoints: ColumnBreakpoints): number {
  const width = window.innerWidth;
  for (const [min, cols] of breakpoints) {
    if (width >= min) return cols;
  }
  return 2;
}

interface VirtualizedBookGridProps {
  /** Total number of items */
  itemCount: number;
  /** Render a single item by index */
  renderItem: (index: number) => React.ReactNode;
  /** Column breakpoints (defaults to LIBRARY_BREAKPOINTS) */
  breakpoints?: ColumnBreakpoints;
}

export function VirtualizedBookGrid({
  itemCount,
  renderItem,
  breakpoints = LIBRARY_BREAKPOINTS,
}: VirtualizedBookGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(2);

  // Track viewport width to derive column count (matches Tailwind breakpoints)
  useEffect(() => {
    const update = () => setColumns(getColumns(breakpoints));
    update();

    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [breakpoints]);

  const rowCount = Math.ceil(itemCount / columns);

  // Estimate row height: card width * 1.5 (aspect 2:3) + ~90px text/status + gap
  const estimateSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return 320;
    const containerWidth = el.clientWidth;
    const cardWidth = (containerWidth - GAP * (columns - 1)) / columns;
    const coverHeight = cardWidth * 1.5;
    return coverHeight + 90 + GAP;
  }, [columns]);

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize,
    overscan: 3,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
    gap: GAP,
  });

  return (
    <div ref={containerRef}>
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowItems = [];
          for (
            let i = startIndex;
            i < Math.min(startIndex + columns, itemCount);
            i++
          ) {
            rowItems.push(
              <div
                key={i}
                className="min-w-0"
                style={{ flex: `0 0 calc((100% - ${GAP * (columns - 1)}px) / ${columns})` }}
              >
                {renderItem(i)}
              </div>
            );
          }

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                display: "flex",
                gap: GAP,
              }}
            >
              {rowItems}
            </div>
          );
        })}
      </div>
    </div>
  );
}
