"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  Search,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { Markdown, type PassageRef, type SectionBookInfo } from "@/components/markdown";
import { ToolCallSteps } from "@/components/tool-call-steps";
import { LandingAnonChat } from "@/components/marketing/landing-anon-chat";
import { getPreviewQuestions } from "@/lib/marketing/preview-questions";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Lightweight demo stub — only question text, no answer payload. */
interface DemoStub {
  id: string;
  question: string;
}

/** Full demo data fetched on demand when user clicks a question. */
interface DemoFull {
  question: string;
  toolCalls: { toolName: string; args: Record<string, unknown> }[];
  answer: string;
  books?: Record<
    string,
    { bookId: string; bookLabel: string; bookType: string | null }
  >;
}

export interface LandingCollection {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  coverUrl: string | null;
  bookCount: number;
  demos: DemoStub[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SESSION_KEY_PREFILL = "minerva_prefill_question";
const SESSION_KEY_COLLECTION = "minerva_prefill_collection";

/** Fetch the full demo data (answer, tool calls, books) by ID. */
async function fetchDemoById(id: string): Promise<DemoFull | null> {
  try {
    const res = await fetch(`/api/collection-demos?id=${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const json = await res.json();
    const d = json.demo;
    if (!d) return null;
    return {
      question: d.question,
      toolCalls: d.toolCalls ?? [],
      answer: d.answer,
      books: d.books,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function LandingSearch({
  collections,
}: {
  collections: LandingCollection[];
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [selectedSlug, setSelectedSlug] = useState(
    collections[0]?.slug ?? ""
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Demo state
  const [activeDemo, setActiveDemo] = useState<DemoFull | null>(null);
  const [loadingDemoId, setLoadingDemoId] = useState<string | null>(null);

  // Live anonymous chat state
  const [anonQuestion, setAnonQuestion] = useState<string | null>(null);

  // Separate state for the demo panel's bottom-CTA follow-up input. Sharing
  // `inputValue` with the main search bar makes both fields render the same
  // text simultaneously when both are visible.
  const [demoFollowUpValue, setDemoFollowUpValue] = useState("");

  // Typewriter placeholder state. Rotates through example questions across
  // collections. Pauses on focus, halts permanently once the user manually
  // interacts (types or picks a collection).
  const [typewriterText, setTypewriterText] = useState("");
  const [typewriterIndex, setTypewriterIndex] = useState(0);
  const [userInteracted, setUserInteracted] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pool of (slug, name, question) tuples drawn from preview-questions.ts
  // (with a length-filtered fallback to c.demos for any unlisted slug).
  // Interleaved across collections so the rotation visibly hops between them
  // and the collection chip flips to match each question as it types.
  const typewriterPool = useMemo(() => {
    const perCollection = collections.map((c) => {
      const questions = getPreviewQuestions(
        c.slug,
        c.demos.map((d) => d.question)
      );
      return questions.map((question) => ({
        slug: c.slug,
        name: c.name,
        question,
      }));
    });
    const interleaved: { slug: string; name: string; question: string }[] = [];
    const maxLen = Math.max(0, ...perCollection.map((arr) => arr.length));
    for (let i = 0; i < maxLen; i++) {
      for (const arr of perCollection) {
        if (arr[i]) interleaved.push(arr[i]);
      }
    }
    return interleaved;
  }, [collections]);

  const selectedCollection = collections.find(
    (c) => c.slug === selectedSlug
  );
  const demos = selectedCollection?.demos ?? [];

  // Always show all demos — don't filter by typed input
  const filteredDemos = demos;

  // Close picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node)
      ) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close focus on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (activeDemo) {
          setActiveDemo(null);
        } else {
          setIsFocused(false);
          inputRef.current?.blur();
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [activeDemo]);

  // Clear the typewriter text when the input is focused so it doesn't hang
  // half-typed beside the user's cursor. The pool resumes typing on blur.
  useEffect(() => {
    if (isFocused) setTypewriterText("");
  }, [isFocused]);

  // Typewriter effect: types out the current example question, pauses, deletes,
  // moves to the next. Bound to typewriterIndex so re-running the effect (after
  // a focus/blur cycle) restarts from the current question without repeating.
  useEffect(() => {
    if (userInteracted) return;
    if (isFocused) return;
    if (typewriterPool.length === 0) return;

    // Respect the user's reduced-motion preference: just show a static example.
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const target = typewriterPool[typewriterIndex % typewriterPool.length];
      setTypewriterText(target.question);
      setSelectedSlug(target.slug);
      return;
    }

    const target = typewriterPool[typewriterIndex % typewriterPool.length];
    setSelectedSlug(target.slug);

    let cancelled = false;
    let charIdx = typewriterText.startsWith(target.question.slice(0, typewriterText.length))
      ? typewriterText.length
      : 0;
    let phase: "typing" | "holding" | "deleting" = "typing";
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delay: number, fn: () => void) => {
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        fn();
      }, delay);
    };

    const tick = () => {
      if (cancelled) return;
      if (phase === "typing") {
        if (charIdx < target.question.length) {
          charIdx++;
          setTypewriterText(target.question.slice(0, charIdx));
          schedule(28 + Math.random() * 32, tick);
        } else {
          phase = "holding";
          schedule(2400, tick);
        }
      } else if (phase === "holding") {
        phase = "deleting";
        schedule(20, tick);
      } else {
        if (charIdx > 0) {
          // Sweep a few chars per tick so deletion feels like a quick wipe
          // rather than a one-by-one undo.
          charIdx = Math.max(0, charIdx - 3);
          setTypewriterText(target.question.slice(0, charIdx));
          schedule(18, tick);
        } else {
          // Advance — the effect re-runs with a fresh question.
          setTypewriterIndex((i) => i + 1);
        }
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typewriterIndex, typewriterPool, userInteracted, isFocused]);

  // Build sectionBookMap from the active demo's books for reference rendering
  const sectionBookMap = useMemo(() => {
    if (!activeDemo?.books) return undefined;
    const map = new Map<string, SectionBookInfo>();
    for (const [sectionId, info] of Object.entries(activeDemo.books)) {
      map.set(sectionId, info);
    }
    return map.size > 0 ? map : undefined;
  }, [activeDemo]);

  const handleRefClick = useCallback((ref: PassageRef) => {
    const bid = ref.bookId;
    if (bid) {
      const url = `/read/${bid}?refSection=${encodeURIComponent(ref.sectionId)}&refQuote=${encodeURIComponent(ref.quotedText ?? "")}`;
      window.open(url, "_blank", "noreferrer");
    }
  }, []);

  // Play a demo: fetch full data by ID, render immediately
  const playDemo = useCallback(
    async (stub: DemoStub) => {
      if (loadingDemoId) return;
      setLoadingDemoId(stub.id);
      setInputValue("");

      const entry = await fetchDemoById(stub.id);
      setLoadingDemoId(null);
      if (entry) {
        setActiveDemo(entry);
      }
    },
    [loadingDemoId]
  );

  // Handle submitting a custom question → start a live anonymous chat.
  // Accepts an optional `q` so the demo panel's bottom input can submit
  // its own value without sharing state with the main search bar.
  const handleSubmitCustom = useCallback((q?: string) => {
    const trimmed = (q ?? inputValue).trim();
    if (!trimmed) return;

    // Persist for graceful recovery if the user later signs up mid-flow
    sessionStorage.setItem(SESSION_KEY_PREFILL, trimmed);
    sessionStorage.setItem(SESSION_KEY_COLLECTION, selectedSlug);

    setActiveDemo(null);
    setAnonQuestion(trimmed);
    setInputValue("");
    setDemoFollowUpValue("");
  }, [inputValue, selectedSlug]);

  // Demo panel follow-ups go to the signup wall (matches the live anon chat's
  // follow-up behavior). The demo is a cached pre-canned answer, so letting
  // users keep asking against it would burn anon quota for a non-real flow.
  const handleDemoFollowUpSubmit = useCallback(() => {
    const q = demoFollowUpValue.trim();
    if (!q) return;
    try {
      sessionStorage.setItem(SESSION_KEY_PREFILL, q);
      sessionStorage.setItem(SESSION_KEY_COLLECTION, selectedSlug);
    } catch {
      /* sessionStorage unavailable (private mode) — proceed anyway. */
    }
    const next = `/browse/${encodeURIComponent(selectedSlug)}?prefill=${encodeURIComponent(q)}&openChat=1`;
    window.location.href = `/auth/sign-up?next=${encodeURIComponent(next)}`;
  }, [demoFollowUpValue, selectedSlug]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && inputValue.trim()) {
        e.preventDefault();
        handleSubmitCustom();
      }
    },
    [inputValue, handleSubmitCustom]
  );

  const showDemoPanel = activeDemo !== null;
  const showAnonChat = anonQuestion !== null;

  return (
    <div ref={containerRef} className="w-full space-y-6">
      {/* Search input area */}
      <div className="mx-auto w-full max-w-3xl space-y-3">
        {/* Main search bar */}
        <div
          className={cn(
            "relative flex items-center rounded-2xl border bg-card shadow-sm transition-all",
            isFocused
              ? "border-primary/50 shadow-lg shadow-primary/5 ring-2 ring-primary/10"
              : "border-border hover:border-border/80 hover:shadow-md"
          )}
        >
          <Search className="ml-4 h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (e.target.value.length > 0) setUserInteracted(true);
            }}
            onFocus={() => setIsFocused(true)}
            onKeyDown={handleKeyDown}
            placeholder={typewriterText || "Ask anything..."}
            autoComplete="off"
            className="flex-1 bg-transparent px-3 py-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {inputValue.trim() && (
            <button
              type="button"
              onClick={() => handleSubmitCustom()}
              className="mr-2 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Ask
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Collection picker — chip always visible, dropdown opens on click */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Searching:</span>
          <div ref={pickerRef} className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen(!pickerOpen)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              {selectedCollection?.name ?? "Select collection"}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {pickerOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-card p-1 shadow-lg">
                {collections.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedSlug(c.slug);
                      setPickerOpen(false);
                      setUserInteracted(true);
                      if (activeDemo) setActiveDemo(null);
                      if (anonQuestion) setAnonQuestion(null);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                      c.slug === selectedSlug && "bg-accent"
                    )}
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.bookCount} books
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live anonymous chat — fired when user submits a custom question */}
      {showAnonChat && selectedCollection && (
        <LandingAnonChat
          key={`${selectedCollection.slug}-${anonQuestion}`}
          collectionSlug={selectedCollection.slug}
          collectionName={selectedCollection.name}
          initialQuestion={anonQuestion!}
          onClose={() => setAnonQuestion(null)}
        />
      )}

      {/* Demo questions list */}
      {isFocused && !showDemoPanel && !showAnonChat && (
        <div className="mx-auto w-full max-w-3xl">
          {filteredDemos.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Try a question
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {filteredDemos.map((demo) => (
                  <button
                    key={demo.id}
                    type="button"
                    onClick={() => playDemo(demo)}
                    disabled={!!loadingDemoId}
                    className="group flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/30 hover:bg-accent hover:shadow-sm disabled:opacity-50"
                  >
                    {loadingDemoId === demo.id && (
                      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
                    )}
                    <span className="text-sm text-foreground">
                      {demo.question}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Demo response — rendered immediately */}
      {showDemoPanel && !showAnonChat && (
        <div className="mx-auto w-full max-w-3xl">
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-1.5 text-sm">
                <span className="font-medium text-foreground">
                  {selectedCollection?.name}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">demo</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveDemo(null)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Close
              </button>
            </div>

            {/* Messages */}
            <div className="max-h-[32rem] overflow-y-auto p-4 space-y-4">
              {/* User question */}
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {activeDemo.question}
                </div>
              </div>

              {/* Tool calls */}
              {activeDemo.toolCalls.length > 0 && (
                <ToolCallSteps
                  toolCalls={activeDemo.toolCalls.map((tc, i) => ({
                    ...tc,
                    id: `landing-tc-${i}`,
                  }))}
                />
              )}

              {/* Full response */}
              <div className="text-foreground select-text">
                <Markdown
                  content={activeDemo.answer}
                  sectionBookMap={sectionBookMap}
                  onRefClick={handleRefClick}
                />
              </div>
            </div>

            {/* Bottom CTA — follow-ups go to the signup wall (demo answers
                are cached pre-canned content; live follow-ups would burn
                anon-chat quota for a non-real flow). */}
            <div className="border-t border-border px-4 py-3">
              <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
                <span className="font-medium">Sign up free</span> to ask follow-ups,
                save your conversation, and search across your own library.
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={demoFollowUpValue}
                  onChange={(e) => setDemoFollowUpValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && demoFollowUpValue.trim()) {
                      e.preventDefault();
                      handleDemoFollowUpSubmit();
                    }
                  }}
                  placeholder="Sign up to ask a follow-up..."
                  autoComplete="off"
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={handleDemoFollowUpSubmit}
                  disabled={!demoFollowUpValue.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:hover:bg-primary"
                >
                  Sign up
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* More demo questions after response */}
          {filteredDemos.length > 1 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Try another question
              </p>
              <div className="flex flex-wrap gap-2">
                {filteredDemos
                  .filter((d) => d.question !== activeDemo?.question)
                  .slice(0, 4)
                  .map((demo) => (
                    <button
                      key={demo.id}
                      type="button"
                      onClick={() => playDemo(demo)}
                      disabled={!!loadingDemoId}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                    >
                      {loadingDemoId === demo.id && (
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      )}
                      <span className="max-w-[250px] truncate">
                        {demo.question}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
