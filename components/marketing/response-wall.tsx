"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Markdown, type PassageRef, type SectionBookInfo } from "@/components/markdown";
import { formatToolLabel } from "@/components/tool-call-steps";


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

/** A single card in the wall — flattened from collection + demo. */
interface ResponseCard {
  /** Unique key for dedup (demo row id, or synthetic for SSR seed). */
  uid: string;
  collectionName: string;
  collectionSlug: string;
  entry: DemoChatEntry;
}

/** Shape returned by GET /api/collection-demos */
interface ApiDemo {
  id: string;
  question: string;
  toolCalls: { toolName: string; args: Record<string, unknown> }[];
  answer: string;
  books?: Record<string, { bookId: string; bookLabel: string; bookType: string | null }>;
  collectionName: string;
  collectionSlug: string;
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

/** Convert API demos to ResponseCards, deduping UIDs via the seen set. */
function demosToCards(demos: ApiDemo[], seen: Set<string>): ResponseCard[] {
  return demos.map((d) => {
    let uid = d.id;
    let suffix = 1;
    while (seen.has(uid)) {
      uid = `${d.id}-${suffix++}`;
    }
    seen.add(uid);
    return {
      uid,
      collectionName: d.collectionName,
      collectionSlug: d.collectionSlug,
      entry: {
        question: d.question,
        toolCalls: d.toolCalls,
        answer: d.answer,
        books: d.books,
      },
    };
  });
}


const CARD_CONTENT_HEIGHT = 420;
/** Base vertical scroll speed in px/sec */
const VERT_PX_PER_SEC = 30;
/** Variance so cards don't all scroll at the same rate */
const VERT_SPEED_VARIANCE = 0.35;

/* ------------------------------------------------------------------ */
/*  ResponseWall                                                       */
/* ------------------------------------------------------------------ */

export function ResponseWall({
  seed,
}: {
  seed: ApiDemo[];
}) {
  // Defer card rendering until after hydration to avoid mismatch
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  // Build cards once from server-provided seed (already randomized server-side)
  const cards = useMemo(() => {
    const seen = new Set<string>();
    return demosToCards(seed, seen);
  }, [seed]);

  if (cards.length === 0) return null;

  return (
    <section className="w-full space-y-4">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          AI-powered reading
        </p>
        <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
          Real answers from real books
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Every reference is clickable and traced to the exact passage.
        </p>
      </div>

      {/* Scrolling wall — only rendered after hydration to avoid mismatch */}
      <div className="relative overflow-hidden" style={{ minHeight: hydrated ? undefined : 480 }}>
        {hydrated ? (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden sm:block sm:w-10 bg-gradient-to-r from-background to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden sm:block sm:w-10 bg-gradient-to-l from-background to-transparent" />
            <div className="py-2">
              <ScrollRow cards={cards} />
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  ScrollRow – CSS-driven infinite horizontal scroll                  */
/*  Horizontal motion uses a CSS @keyframes animation on the           */
/*  compositor thread, immune to main-thread GC/JS pauses.             */
/* ------------------------------------------------------------------ */

const DESKTOP_PX_PER_SEC = 40;

function ScrollRow({
  cards,
}: {
  cards: ResponseCard[];
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Measure half-width once after first layout, set animation directly on DOM
  // to avoid React re-renders that would restart the CSS animation.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const raf = requestAnimationFrame(() => {
      const halfWidth = track.scrollWidth / 2;
      if (halfWidth > 0) {
        const duration = halfWidth / DESKTOP_PX_PER_SEC;
        track.style.animation = `wall-scroll-left ${duration}s linear infinite`;
      }
    });

    return () => cancelAnimationFrame(raf);
  }, []);

  // Pause on hover via DOM to avoid re-render
  const handleMouseEnter = useCallback(() => {
    if (trackRef.current) trackRef.current.style.animationPlayState = "paused";
  }, []);
  const handleMouseLeave = useCallback(() => {
    if (trackRef.current) trackRef.current.style.animationPlayState = "running";
  }, []);

  // Build display array: cards + duplicate for seamless loop
  const displayCards = useMemo(() => [...cards, ...cards], [cards]);

  return (
    <div
      className="flex overflow-hidden"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={trackRef}
        className="flex shrink-0 gap-4"
        style={{ willChange: "transform" }}
      >
        {displayCards.map((card, i) => (
          <CardPreview
            key={`${card.uid}-${i}`}
            card={card}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CardPreview – tall card with compositor-driven vertical scroll     */
/*  Uses Web Animations API (element.animate) — runs on compositor     */
/*  thread, immune to main-thread GC/JS pauses.                        */
/* ------------------------------------------------------------------ */

function CardPreview({
  card,
}: {
  card: ResponseCard;
}) {
  const { entry, collectionName } = card;
  const innerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);

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

  // Start compositor-driven vertical scroll after content renders
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const initTimer = setTimeout(() => {
      const maxScroll = inner.scrollHeight - CARD_CONTENT_HEIGHT;
      if (maxScroll <= 0) return;

      // Vary speed per card so they don't all move in lockstep
      const speed = VERT_PX_PER_SEC * (1 + (Math.random() * 2 - 1) * VERT_SPEED_VARIANCE);
      const duration = (maxScroll / speed) * 1000;

      const anim = inner.animate(
        [
          { transform: "translateY(0)" },
          { transform: `translateY(${-maxScroll}px)` },
        ],
        {
          duration,
          iterations: Infinity,
          direction: "alternate",
          easing: "linear",
        }
      );

      animRef.current = anim;
    }, 400);

    return () => {
      clearTimeout(initTimer);
      animRef.current?.cancel();
      animRef.current = null;
    };
  }, []);

  return (
    <div
      className="group relative flex w-[340px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm sm:w-[400px]"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 shrink-0">
        <Sparkles className="h-3 w-3 text-primary" />
        <span className="text-[11px] font-medium text-muted-foreground">
          {collectionName}
        </span>
      </div>

      <div className="px-3 pt-2.5 pb-1 shrink-0">
        <p className="text-sm font-medium text-foreground line-clamp-2">
          {entry.question}
        </p>
      </div>

      {toolSummary && (
        <div className="px-3 pb-1 shrink-0">
          <span className="text-[11px] text-muted-foreground">
            {toolSummary}
          </span>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <div
          className="px-3 pb-3"
          style={{ height: `${CARD_CONTENT_HEIGHT}px`, overflow: "hidden" }}
        >
          <div ref={innerRef} style={{ willChange: "transform" }}>
            <Markdown
              content={entry.answer}
              sectionBookMap={sectionBookMap}
              onRefClick={handleRefClick}
            />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-card to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
      </div>
    </div>
  );
}
