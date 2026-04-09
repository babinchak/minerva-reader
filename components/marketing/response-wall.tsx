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

/** Fisher-Yates shuffle (in place). */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ------------------------------------------------------------------ */
/*  Fetch helper                                                       */
/* ------------------------------------------------------------------ */

const BATCH_SIZE = 30;

async function fetchDemoBatch(
  excludeIds: string[],
): Promise<ApiDemo[]> {
  const params = new URLSearchParams({ limit: String(BATCH_SIZE) });
  if (excludeIds.length > 0) params.set("exclude", excludeIds.join(","));
  try {
    const res = await fetch(`/api/collection-demos?${params.toString()}`);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.demos ?? []) as ApiDemo[];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Shared vertical-scroll driver                                      */
/*  One rAF loop drives ALL visible cards' vertical auto-scroll.       */
/* ------------------------------------------------------------------ */

interface CardScrollState {
  clip: HTMLDivElement;
  inner: HTMLDivElement;
  root: HTMLDivElement;
  speed: number;
  scrollPos: number;
  maxScroll: number;
  refPositions: number[];
  pauseUntil: number;
  isInteracting: boolean;
  wasInteracting: boolean;
  isVisible: boolean;
}

const cardScrollRegistry = new Set<CardScrollState>();
let sharedAnimId: number | null = null;

const CARD_CONTENT_HEIGHT = 420;
const SCROLL_PX_PER_FRAME_BASE = 1.2;
const SCROLL_SPEED_VARIANCE = 0.35;
const SLOWDOWN_RANGE = 160;
const MIN_SPEED_FACTOR = 0.04;
const PAUSE_AT_LOOP_MS = 1500;

function startSharedLoop() {
  if (sharedAnimId !== null) return;

  function tick() {
    const now = Date.now();

    for (const s of cardScrollRegistry) {
      if (!s.isVisible) continue;

      // Transition: user started interacting
      if (s.isInteracting && !s.wasInteracting) {
        s.inner.style.transform = "";
        s.inner.style.willChange = "";
        s.clip.style.overflowY = "auto";
        s.clip.scrollTop = s.scrollPos;
        s.wasInteracting = true;
      }

      // Transition: user stopped interacting
      if (!s.isInteracting && s.wasInteracting) {
        s.scrollPos = Math.min(s.clip.scrollTop, s.maxScroll);
        s.clip.style.overflowY = "hidden";
        s.clip.scrollTop = 0;
        s.inner.style.willChange = "transform";
        s.inner.style.transform = `translateY(${-s.scrollPos}px)`;
        s.wasInteracting = false;
      }

      if (s.isInteracting) continue;

      if (now >= s.pauseUntil) {
        const viewCenter = s.scrollPos + CARD_CONTENT_HEIGHT / 2;
        let speedFactor = 1;

        for (const pos of s.refPositions) {
          const dist = Math.abs(pos - viewCenter);
          if (dist < SLOWDOWN_RANGE) {
            const t = dist / SLOWDOWN_RANGE;
            const factor =
              MIN_SPEED_FACTOR +
              (1 - MIN_SPEED_FACTOR) * (1 - Math.cos(t * Math.PI)) / 2;
            speedFactor = Math.min(speedFactor, factor);
          }
        }

        s.scrollPos += s.speed * speedFactor;

        if (s.scrollPos >= s.maxScroll) {
          s.scrollPos = 0;
          s.pauseUntil = now + PAUSE_AT_LOOP_MS;
        }

        s.inner.style.transform = `translateY(${-s.scrollPos}px)`;
      }
    }

    sharedAnimId = requestAnimationFrame(tick);
  }

  sharedAnimId = requestAnimationFrame(tick);
}

function stopSharedLoopIfEmpty() {
  if (cardScrollRegistry.size === 0 && sharedAnimId !== null) {
    cancelAnimationFrame(sharedAnimId);
    sharedAnimId = null;
  }
}

/* ------------------------------------------------------------------ */
/*  ResponseWall                                                       */
/* ------------------------------------------------------------------ */

export function ResponseWall({
  seed,
}: {
  seed: ApiDemo[];
}) {
  const seenIdsRef = useRef<Set<string>>(new Set());
  // Defer card rendering until after hydration to avoid mismatch
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  // Build initial cards from server-provided seed (already shuffled server-side)
  const seedCards = useMemo(
    () => demosToCards(seed, seenIdsRef.current),
    [seed]
  );

  const [cardPool, setCardPool] = useState<ResponseCard[]>(seedCards);
  const fetchingRef = useRef(false);

  // Called by ScrollRow when it's approaching the end of its cards
  const handleNeedMore = useCallback(() => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    const recentIds = cardPool
      .map((c) => c.uid)
      .slice(-20);

    fetchDemoBatch(recentIds).then((demos) => {
      if (demos.length > 0) {
        const newCards = demosToCards(demos, seenIdsRef.current);
        setCardPool((prev) => [...prev, ...shuffle(newCards)]);
      }
      fetchingRef.current = false;
    });
  }, [cardPool]);

  if (cardPool.length === 0) return null;

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
              <ScrollRow
                cards={cardPool}
                onNeedMore={handleNeedMore}
              />
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  ScrollRow – JS-driven infinite horizontal scroll                   */
/* ------------------------------------------------------------------ */

const CARD_GAP_PX = 16;
const DESKTOP_PX_PER_SEC = 40;
const HOLD_DURATION_MS = 5000;
const GLIDE_DURATION_MS = 800;
const REFILL_THRESHOLD = 0.6;
const TOUCH_RESUME_DELAY_MS = 2000;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function ScrollRow({
  cards,
  onNeedMore,
}: {
  cards: ResponseCard[];
  onNeedMore: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const needMoreCalledRef = useRef(false);
  const lastNeedMoreCountRef = useRef(0);
  // Cached scrollWidth — updated on resize or card count change, not every frame
  const cachedHalfWidthRef = useRef(0);

  // Detect narrow viewport → glide mode
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function check() {
      setIsNarrow(container!.clientWidth < 340 * 1.5 + CARD_GAP_PX);
    }
    check();
    const ro = new ResizeObserver(check);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Update cached scrollWidth when cards change or on resize
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    // Defer measurement to after layout
    const raf = requestAnimationFrame(() => {
      cachedHalfWidthRef.current = track.scrollWidth / 2;
    });
    const ro = new ResizeObserver(() => {
      cachedHalfWidthRef.current = track.scrollWidth / 2;
    });
    ro.observe(track);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [cards.length]);

  // Reset needMore flag when pool actually grows
  useEffect(() => {
    if (cards.length > lastNeedMoreCountRef.current) {
      needMoreCalledRef.current = false;
    }
  }, [cards.length]);

  // ---- Desktop: continuous smooth horizontal scroll via transform ----
  useEffect(() => {
    if (isNarrow) return;
    const track = trackRef.current;
    if (!track) return;

    let cancelled = false;
    let animId: number;
    let scrollX = 0;
    let lastTime = 0;

    function tick(now: number) {
      if (cancelled) return;
      if (lastTime === 0) lastTime = now;
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      scrollX += DESKTOP_PX_PER_SEC * dt;

      const halfWidth = cachedHalfWidthRef.current;

      if (halfWidth > 0 && scrollX >= halfWidth) {
        scrollX -= halfWidth;
      }

      track!.style.transform = `translateX(${-scrollX}px)`;

      if (halfWidth > 0 && scrollX > halfWidth * REFILL_THRESHOLD && !needMoreCalledRef.current) {
        needMoreCalledRef.current = true;
        lastNeedMoreCountRef.current = cards.length;
        onNeedMore();
      }

      animId = requestAnimationFrame(tick);
    }

    animId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
    };
  }, [isNarrow, cards.length, onNeedMore]);

  // ---- Mobile: hold-and-glide ----
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
        const currentX = fromX + (toX - fromX) * eased;
        track!.style.transform = `translateX(${currentX}px)`;

        if (t >= 1) {
          currentIndex++;
          if (currentIndex >= totalCards) {
            currentIndex = 0;
            track!.style.transform = `translateX(${offsetToCenter}px)`;
          }
          phase = "hold";
          phaseStart = now;

          if (currentIndex > totalCards * REFILL_THRESHOLD && !needMoreCalledRef.current) {
            needMoreCalledRef.current = true;
            lastNeedMoreCountRef.current = cards.length;
            onNeedMore();
          }
        }
      }

      animId = requestAnimationFrame(tick);
    }

    animId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
    };
  }, [isNarrow, cards.length, onNeedMore]);

  // Build display array: cards + duplicate for seamless loop
  const displayCards = useMemo(() => [...cards, ...cards], [cards]);

  return (
    <div ref={containerRef} className="flex overflow-hidden">
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
/*  CardPreview – tall card with vertical auto-scroll                  */
/*  Registers with shared rAF loop instead of running its own.         */
/* ------------------------------------------------------------------ */

function CardPreview({
  card,
}: {
  card: ResponseCard;
}) {
  const { entry, collectionName } = card;
  const cardRootRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const scrollStateRef = useRef<CardScrollState | null>(null);
  const touchResumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Register with shared scroll loop
  useEffect(() => {
    const clip = clipRef.current;
    const inner = innerRef.current;
    const root = cardRootRef.current;
    if (!clip || !inner || !root) return;

    const initTimer = setTimeout(() => {
      const refElements = inner.querySelectorAll('span[role="button"]');
      const refPositions = Array.from(refElements).map(
        (el) => (el as HTMLElement).offsetTop
      );

      const contentHeight = inner.scrollHeight;
      const maxScroll = contentHeight - CARD_CONTENT_HEIGHT;
      if (maxScroll <= 0) return;

      const state: CardScrollState = {
        clip,
        inner,
        root,
        speed: SCROLL_PX_PER_FRAME_BASE * (1 + (Math.random() * 2 - 1) * SCROLL_SPEED_VARIANCE),
        scrollPos: 0,
        maxScroll,
        refPositions,
        pauseUntil: 0,
        isInteracting: false,
        wasInteracting: false,
        isVisible: false,
      };

      inner.style.willChange = "transform";
      clip.style.overflowY = "hidden";

      scrollStateRef.current = state;
      cardScrollRegistry.add(state);
      startSharedLoop();

      // IntersectionObserver to toggle visibility
      const observer = new IntersectionObserver(
        ([e]) => { state.isVisible = e.isIntersecting; },
        { rootMargin: "200px" }
      );
      observer.observe(root);

      // Store observer for cleanup
      (state as any)._observer = observer;
    }, 400);

    return () => {
      clearTimeout(initTimer);
      if (touchResumeTimer.current) clearTimeout(touchResumeTimer.current);
      const state = scrollStateRef.current;
      if (state) {
        cardScrollRegistry.delete(state);
        stopSharedLoopIfEmpty();
        (state as any)._observer?.disconnect();
        scrollStateRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={cardRootRef}
      className="group relative flex w-[340px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm sm:w-[400px]"
      onMouseEnter={() => {
        if (scrollStateRef.current) scrollStateRef.current.isInteracting = true;
      }}
      onMouseLeave={() => {
        if (scrollStateRef.current) scrollStateRef.current.isInteracting = false;
      }}
      onTouchStart={() => {
        if (touchResumeTimer.current) clearTimeout(touchResumeTimer.current);
        if (scrollStateRef.current) scrollStateRef.current.isInteracting = true;
      }}
      onTouchEnd={() => {
        touchResumeTimer.current = setTimeout(() => {
          if (scrollStateRef.current) scrollStateRef.current.isInteracting = false;
        }, TOUCH_RESUME_DELAY_MS);
      }}
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
          ref={clipRef}
          className="px-3 pb-3 scrollbar-none"
          style={{ height: `${CARD_CONTENT_HEIGHT}px`, overflowY: "hidden" }}
        >
          <div ref={innerRef} style={{ willChange: "transform", transform: "translateY(0px)" }}>
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
