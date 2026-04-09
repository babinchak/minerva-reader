"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Highlighter, Library, Search, Sparkles } from "lucide-react";
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


/* ------------------------------------------------------------------ */
/*  Rotating headlines                                                  */
/* ------------------------------------------------------------------ */

const HEADLINES = [
  "Don't just read. Viberead.",
  "Stop copy-pasting passages into ChatGPT",
  "Search across your entire book collection",
  "One tap to navigate to any reference",
  "Search an author's entire body of work in seconds",
  "AI reading, done right",
  "RAG-tastic reading",
  "Find that quote you half-remember",
  "Not a summary app. A reading app.",
  "Stop losing your place in dense books",
  "Unlock every book's full potential",
  "Your smartest reading companion",
  "Prep for book club in 5 minutes",
  "Cross-reference ideas across 10 books at once",
  "Your entire library, instantly searchable",
  "Now you can finally understand Hegel",
  "Did Dumbledore really ask calmly? Now you can check.",
  "Call me Ishmael. Or just search for him.",
  "MLA format not included",
  "Quote-finding machine",
  "Paine, Locke, and Jefferson walk into a search bar",
  "Ask Nietzsche and Buddha the same question",
  "Settle the free will debate once and for all",
  "When is retreat wisdom? Ask five generals at once.",
  "Plot twist: the footnotes were useful",
  "Search the canon",
  "Ask. Read. Know.",
  "Upload your entire pogonology collection",
  "The paragraph you reread four times? Just ask.",
  "Every obscure reference, explained in context",
  "That passage you skipped? It actually makes sense now.",
  "No more pretending you understood that paragraph",
  "Finally understand that Latin phrase Nietzsche dropped",
];

const HEADLINE_INTERVAL_MS = 4000;

const FEATURES = [
  { icon: Highlighter, text: "Highlight and explain anything in context" },
  { icon: Search, text: "Deep semantic search within any book" },
  { icon: Library, text: "Ask questions across entire collections" },
  { icon: BookOpen, text: "Navigate to the exact cited passage" },
];

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
    <section className="w-full space-y-6">
      {/* Static feature pills */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div
            key={f.text}
            className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5"
          >
            <f.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="text-sm text-muted-foreground">{f.text}</span>
          </div>
        ))}
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
/*  RotatingHeadline                                                    */
/* ------------------------------------------------------------------ */

function pickWeightedIndex(lastShown: number[], current: number): number {
  const now = Date.now();
  const weights = lastShown.map((t, i) =>
    i === current ? 0 : Math.max(now - t, 1)
  );
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return (current + 1) % HEADLINES.length;
}

export function RotatingHeadline() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const lastShownRef = useRef<number[]>(
    HEADLINES.map(() => 0)
  );

  useEffect(() => {
    lastShownRef.current[index] = Date.now();
  }, [index]);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => pickWeightedIndex(lastShownRef.current, i));
        setVisible(true);
      }, 400);
    }, HEADLINE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative h-[2.5rem] sm:h-[2.5rem] overflow-hidden">
      <h1
        className="text-center text-2xl font-bold tracking-tight text-foreground transition-all duration-400 ease-in-out sm:text-3xl"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(-12px)",
        }}
      >
        {HEADLINES[index]}
      </h1>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ScrollRow – CSS on desktop, JS hold-and-glide on mobile            */
/* ------------------------------------------------------------------ */

const DESKTOP_PX_PER_SEC = 40;
const CARD_GAP_PX = 16;
const NARROW_BREAKPOINT = 340 * 1.5 + CARD_GAP_PX;
const HOLD_DURATION_MS = 5000;
const GLIDE_DURATION_MS = 800;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function ScrollRow({
  cards,
}: {
  cards: ResponseCard[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  // Detect narrow viewport
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function check() {
      setIsNarrow(container!.clientWidth < NARROW_BREAKPOINT);
    }
    check();
    const ro = new ResizeObserver(check);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ---- Desktop: CSS animation (compositor thread) ----
  useEffect(() => {
    if (isNarrow) return;
    const track = trackRef.current;
    if (!track) return;

    const raf = requestAnimationFrame(() => {
      const halfWidth = track.scrollWidth / 2;
      if (halfWidth > 0) {
        const duration = halfWidth / DESKTOP_PX_PER_SEC;
        track.style.animation = `wall-scroll-left ${duration}s linear infinite`;
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      if (track) track.style.animation = "";
    };
  }, [isNarrow]);

  // ---- Mobile: JS hold-and-glide (one card at a time) ----
  useEffect(() => {
    if (!isNarrow) return;
    const track = trackRef.current;
    const container = containerRef.current;
    if (!track || !container) return;

    let cancelled = false;
    let animId: number;

    const firstCard = track.children[0] as HTMLElement | undefined;
    if (!firstCard) return;
    const cardWidth = firstCard.offsetWidth + CARD_GAP_PX;
    const totalCards = cards.length;

    let currentIndex = 0;
    let phase: "hold" | "glide" = "hold";
    let phaseStart = performance.now();

    const containerWidth = container.clientWidth;
    const offsetToCenter = (containerWidth - firstCard.offsetWidth) / 2;
    track.style.transform = `translateX(${offsetToCenter}px)`;

    function tick(now: number) {
      if (cancelled) return;
      const elapsed = now - phaseStart;

      if (phase === "hold") {
        if (elapsed >= HOLD_DURATION_MS) {
          phase = "glide";
          phaseStart = now;
        }
      } else {
        const t = Math.min(elapsed / GLIDE_DURATION_MS, 1);
        const eased = easeInOutCubic(t);
        const fromX = -currentIndex * cardWidth + offsetToCenter;
        const toX = -(currentIndex + 1) * cardWidth + offsetToCenter;
        track!.style.transform = `translateX(${fromX + (toX - fromX) * eased}px)`;

        if (t >= 1) {
          currentIndex = (currentIndex + 1) % totalCards;
          phase = "hold";
          phaseStart = now;
        }
      }

      animId = requestAnimationFrame(tick);
    }

    animId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
    };
  }, [isNarrow, cards.length]);

  // Pause desktop CSS on hover via DOM
  const handleMouseEnter = useCallback(() => {
    if (!isNarrow && trackRef.current) trackRef.current.style.animationPlayState = "paused";
  }, [isNarrow]);
  const handleMouseLeave = useCallback(() => {
    if (!isNarrow && trackRef.current) trackRef.current.style.animationPlayState = "running";
  }, [isNarrow]);

  // Desktop: duplicate cards for seamless CSS loop. Mobile: single set.
  const displayCards = useMemo(
    () => isNarrow ? cards : [...cards, ...cards],
    [cards, isNarrow]
  );

  return (
    <div
      ref={containerRef}
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
