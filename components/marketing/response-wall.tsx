"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Markdown, type PassageRef, type SectionBookInfo } from "@/components/markdown";
import { formatToolLabel } from "@/components/tool-call-steps";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DemoChatEntry {
  question: string;
  toolCalls: { toolName: string; args: Record<string, unknown> }[];
  answer: string;
  books?: Record<
    string,
    { bookId: string; bookLabel: string; bookType: string | null }
  >;
}

interface CollectionInfo {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  coverUrl: string | null;
  bookCount: number;
  demos: DemoChatEntry[];
}

interface ResponseCard {
  collectionName: string;
  collectionSlug: string;
  entry: DemoChatEntry;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildSectionBookMap(
  books?: Record<
    string,
    { bookId: string; bookLabel: string; bookType: string | null }
  >
): Map<string, SectionBookInfo> | undefined {
  if (!books) return undefined;
  const map = new Map<string, SectionBookInfo>();
  for (const [sectionId, info] of Object.entries(books)) {
    map.set(sectionId, info);
  }
  return map.size > 0 ? map : undefined;
}

/* ------------------------------------------------------------------ */
/*  ResponseWall                                                       */
/* ------------------------------------------------------------------ */

export function ResponseWall({
  collections,
}: {
  collections: CollectionInfo[];
}) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  // Flatten all demos into cards
  const allCards: ResponseCard[] = useMemo(
    () =>
      collections.flatMap((c) =>
        c.demos.map((entry) => ({
          collectionName: c.name,
          collectionSlug: c.slug,
          entry,
        }))
      ),
    [collections]
  );

  const filteredCards = activeFilter
    ? allCards.filter((c) => c.collectionSlug === activeFilter)
    : allCards;

  if (allCards.length === 0) return null;

  return (
    <section className="w-full space-y-4">
      {/* Header + filter pills */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            AI-powered reading
          </p>
          <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
            See Minerva in action
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Real AI responses across curated book collections. Every reference is
            clickable.
          </p>
        </div>

        {collections.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveFilter(null)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                !activeFilter
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              All
            </button>
            {collections
              .filter((c) => c.demos.length > 0)
              .map((c) => (
                <button
                  key={c.slug}
                  onClick={() =>
                    setActiveFilter(
                      c.slug === activeFilter ? null : c.slug
                    )
                  }
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    activeFilter === c.slug
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  {c.name}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Scrolling wall – single row */}
      <div className="relative overflow-hidden">
        {/* Fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 sm:w-16 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 sm:w-16 bg-gradient-to-l from-background to-transparent" />

        <div className="py-2">
          <ScrollRow
            key={`wall-${activeFilter ?? "all"}`}
            cards={filteredCards}
            speed={80}
          />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  ScrollRow – single infinite horizontal ticker                      */
/* ------------------------------------------------------------------ */

function ScrollRow({
  cards,
  speed,
}: {
  cards: ResponseCard[];
  speed: number;
}) {
  // Ensure enough cards to fill the viewport; repeat set if needed
  const minCards = Math.max(cards.length * 2, 6);
  const repeatedCards: ResponseCard[] = [];
  while (repeatedCards.length < minCards) {
    repeatedCards.push(...cards);
  }
  // Double for seamless loop
  const displayCards = [...repeatedCards, ...repeatedCards];

  return (
    <div className="flex overflow-hidden">
      <div
        className="flex shrink-0 gap-4"
        style={{
          animation: `wall-scroll-left ${speed}s linear infinite`,
        }}
      >
        {displayCards.map((card, i) => (
          <CardPreview
            key={`${card.collectionSlug}-${i}`}
            card={card}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CardPreview – tall card with vertical auto-scroll                  */
/*  Content scrolls down through the response, pausing at each         */
/*  navigable reference so visitors can see the clickable passages.    */
/*  References are directly clickable (open book in new tab).          */
/* ------------------------------------------------------------------ */

const CARD_CONTENT_HEIGHT = 420; // px – visible content window
const SCROLL_PX_PER_FRAME_BASE = 1.2; // ~72px/sec at 60fps base speed
const SCROLL_SPEED_VARIANCE = 0.35; // ±35% random variation per card
const SLOWDOWN_RANGE = 160; // px – start decelerating this far from a reference
const MIN_SPEED_FACTOR = 0.04; // near-zero at the reference center (not a full stop)
const PAUSE_AT_LOOP_MS = 1500; // pause before looping back to top

function CardPreview({
  card,
}: {
  card: ResponseCard;
}) {
  const { entry, collectionName } = card;
  const contentRef = useRef<HTMLDivElement>(null);
  const isHoveredRef = useRef(false);
  const scrollPosRef = useRef(0); // shared between auto-scroll and manual scroll

  const toolSummary =
    entry.toolCalls.length > 0
      ? entry.toolCalls.map((tc) => formatToolLabel(tc.toolName)).join(", ")
      : null;

  const sectionBookMap = useMemo(
    () => buildSectionBookMap(entry.books),
    [entry.books]
  );

  const handleRefClick = useCallback((ref: PassageRef) => {
    const bid = ref.bookId;
    if (bid) {
      const url = `/read/${bid}?refSection=${encodeURIComponent(ref.sectionId)}&refQuote=${encodeURIComponent(ref.quotedText ?? "")}`;
      window.open(url, "_blank", "noreferrer");
    }
  }, []);

  // Vertical auto-scroll with pauses at navigable references
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    let cancelled = false;
    let animId: number;

    // Random speed per card instance so they don't all scroll in lockstep
    const cardSpeed =
      SCROLL_PX_PER_FRAME_BASE *
      (1 + (Math.random() * 2 - 1) * SCROLL_SPEED_VARIANCE);

    // Wait for markdown to render so we can measure reference positions
    const initTimer = setTimeout(() => {
      if (cancelled) return;

      // Find all navigable reference elements (rendered as span[role="button"] by Markdown)
      const refElements = container.querySelectorAll('span[role="button"]');
      const refPositions = Array.from(refElements).map(
        (el) => (el as HTMLElement).offsetTop
      );

      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      if (scrollHeight <= clientHeight) return; // Content fits, no scrolling needed

      let pauseUntil = 0;

      function tick() {
        if (cancelled) return;

        // When hovered, user controls scrolling – sync our position from container
        if (isHoveredRef.current) {
          scrollPosRef.current = container.scrollTop;
          animId = requestAnimationFrame(tick);
          return;
        }

        const now = Date.now();
        if (now >= pauseUntil) {
          // Smooth speed curve: decelerate near references, accelerate away
          const viewCenter = scrollPosRef.current + clientHeight / 2;
          let speedFactor = 1;

          for (const pos of refPositions) {
            const dist = Math.abs(pos - viewCenter);
            if (dist < SLOWDOWN_RANGE) {
              // Cosine ease: full speed at edges, near-zero at center
              const t = dist / SLOWDOWN_RANGE; // 0 at ref center, 1 at range edge
              const factor =
                MIN_SPEED_FACTOR +
                (1 - MIN_SPEED_FACTOR) *
                  (1 - Math.cos(t * Math.PI)) / 2;
              speedFactor = Math.min(speedFactor, factor);
            }
          }

          scrollPosRef.current += cardSpeed * speedFactor;

          // Loop back to top
          if (scrollPosRef.current >= scrollHeight - clientHeight) {
            scrollPosRef.current = 0;
            pauseUntil = now + PAUSE_AT_LOOP_MS;
          }

          container.scrollTop = scrollPosRef.current;
        }

        animId = requestAnimationFrame(tick);
      }

      animId = requestAnimationFrame(tick);
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div
      className="group relative flex w-[340px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm sm:w-[400px]"
      onMouseEnter={() => { isHoveredRef.current = true; }}
      onMouseLeave={() => { isHoveredRef.current = false; }}
    >
      {/* Header: collection badge */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 shrink-0">
        <Sparkles className="h-3 w-3 text-primary" />
        <span className="text-[11px] font-medium text-muted-foreground">
          {collectionName}
        </span>
      </div>

      {/* Question */}
      <div className="px-3 pt-2.5 pb-1 shrink-0">
        <p className="text-sm font-medium text-foreground line-clamp-2">
          {entry.question}
        </p>
      </div>

      {/* Tool call summary */}
      {toolSummary && (
        <div className="px-3 pb-1 shrink-0">
          <span className="text-[11px] text-muted-foreground">
            {toolSummary}
          </span>
        </div>
      )}

      {/* Answer content – auto-scrolls, manual scroll on hover */}
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={contentRef}
          className="overflow-y-auto px-3 pb-3 scrollbar-none"
          style={{ height: `${CARD_CONTENT_HEIGHT}px` }}
        >
          <Markdown
            content={entry.answer}
            sectionBookMap={sectionBookMap}
            onRefClick={handleRefClick}
          />
        </div>
        {/* Top fade */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-card to-transparent" />
        {/* Bottom fade */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
      </div>
    </div>
  );
}
