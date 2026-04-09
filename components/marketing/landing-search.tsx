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
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Markdown, type PassageRef, type SectionBookInfo } from "@/components/markdown";
import { ToolCallSteps } from "@/components/tool-call-steps";
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

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Handle submitting a custom question → redirect to login
  const handleSubmitCustom = useCallback(() => {
    const q = inputValue.trim();
    if (!q) return;

    // Save to sessionStorage so we can recover after auth
    sessionStorage.setItem(SESSION_KEY_PREFILL, q);
    sessionStorage.setItem(SESSION_KEY_COLLECTION, selectedSlug);

    // Redirect to login with next= pointing to collection page
    const next = `/browse/${encodeURIComponent(selectedSlug)}?prefill=${encodeURIComponent(q)}&openChat=1`;
    window.location.href = `/auth/login?next=${encodeURIComponent(next)}`;
  }, [inputValue, selectedSlug]);

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
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything across 150,000+ passages and 300+ books..."
            className="flex-1 bg-transparent px-3 py-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {inputValue.trim() && (
            <button
              type="button"
              onClick={handleSubmitCustom}
              className="mr-2 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Ask
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Collection picker */}
        {isFocused && (
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
                        if (activeDemo) {
                          setActiveDemo(null);
                        }
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
        )}
      </div>

      {/* Demo questions list */}
      {isFocused && !showDemoPanel && (
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
                    <Sparkles className={cn(
                      "mt-0.5 h-4 w-4 shrink-0 transition-colors group-hover:text-primary",
                      loadingDemoId === demo.id ? "animate-spin text-primary" : "text-primary/60"
                    )} />
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
      {showDemoPanel && (
        <div className="mx-auto w-full max-w-3xl">
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">
                  {selectedCollection?.name}
                </span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  Demo
                </span>
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

            {/* Bottom CTA */}
            <div className="border-t border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && inputValue.trim()) {
                      e.preventDefault();
                      handleSubmitCustom();
                    }
                  }}
                  placeholder="Ask a follow-up..."
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={handleSubmitCustom}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {inputValue.trim() ? "Sign in to ask" : "Sign in for more"}
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
                      <Sparkles className="h-3 w-3 text-primary/60" />
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
