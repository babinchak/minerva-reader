"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  BookOpenText,
  Highlighter,
  Minus,
  Plus,
  Search,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useRouter } from "next/navigation";
import { getCurrentPdfSelectionPosition } from "@/lib/pdf-position/selection-position";
import { queryPdfSummariesForPosition } from "@/lib/pdf-position/summaries";
import { AIAssistant } from "@/components/ai-assistant";
import { useSelectedText } from "@/lib/use-selected-text";
import { useIsMobile } from "@/lib/use-media-query";

type PDFDocumentLoadingTask = {
  promise: Promise<PDFDocumentProxy>;
  destroy: () => void;
};

const PDF_DEBUG_ENABLED =
  process.env.NEXT_PUBLIC_PDF_DEBUG === "1" ||
  process.env.NEXT_PUBLIC_PDF_DEBUG === "true";

interface PdfReaderProps {
  pdfUrl: string;
  fileName?: string | null;
  bookId: string;
  initialPage?: number;
}

export function PdfReader({ pdfUrl, bookId, initialPage }: PdfReaderProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDebugPanelOpen, setIsDebugPanelOpen] = useState(false);
  const selectedText = useSelectedText();
  const selectionExists = Boolean(selectedText && selectedText.trim().length > 0);
  const router = useRouter();
  const isMobile = useIsMobile();
  const [chromeVisible, setChromeVisible] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  const [currentPage, setCurrentPage] = useState(initialPage ?? 1);
  const [pageInput, setPageInput] = useState(String(initialPage ?? 1));
  const [isEditingPage, setIsEditingPage] = useState(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<"normal" | "semantic">("normal");
  const [searchQuery, setSearchQuery] = useState("");

  const aiNonceRef = useRef(0);
  const [aiRequest, setAiRequest] = useState<{ nonce: number; action: "page" | "selection" } | null>(
    null,
  );
  const openAiNonceRef = useRef(0);
  const [openAiRequest, setOpenAiRequest] = useState<{ nonce: number } | null>(null);
  const [isAiPaneOpen, setIsAiPaneOpen] = useState(false);

  // Global PDF zoom (applies to ALL pages by re-rendering at a larger viewport scale).
  // This avoids per-page transforms that can cause "chopped" edges and makes scroll work naturally.
  // On mobile, keep the minimum zoom close to fit-to-width so pages don't feel "shrunk" with big gutters.
  const MIN_RENDER_SCALE_DESKTOP = 0.7;
  const MIN_RENDER_SCALE_MOBILE = 0.95;
  const MIN_RENDER_SCALE = isMobile ? MIN_RENDER_SCALE_MOBILE : MIN_RENDER_SCALE_DESKTOP;
  const MAX_RENDER_SCALE = 4;
  const [renderScale, setRenderScale] = useState(1);
  const [gesture, setGesture] = useState<{ active: boolean; scale: number; tx: number; ty: number }>({
    active: false,
    scale: 1,
    tx: 0,
    ty: 0,
  });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchStartRef = useRef<
    | {
        startRenderScale: number;
        startDist: number;
        anchorX: number;
        anchorY: number;
        scrollLeft: number;
        scrollTop: number;
        scrollRectLeft: number;
        scrollRectTop: number;
        lastMidOffsetX: number;
        lastMidOffsetY: number;
      }
    | null
  >(null);
  const lastCombinedScaleRef = useRef<number>(1);
  const pendingScrollAdjustRef = useRef<
    | {
        anchorX: number;
        anchorY: number;
        midOffsetX: number;
        midOffsetY: number;
        ratio: number;
      }
    | null
  >(null);
  const tapRef = useRef<{ pointerId: number; x: number; y: number; t: number; moved: boolean } | null>(
    null,
  );

  useEffect(() => {
    // Default to an "immersive" UI on mobile: tap center to reveal chrome.
    setChromeVisible(!isMobile);
    // Keep debug panel closed on mobile unless explicitly opened.
    if (isMobile) setIsDebugPanelOpen(false);
  }, [isMobile]);

  const getCurrentPageNumberFromViewport = () => {
    const scroller = scrollRef.current;
    const viewer = viewerRef.current;
    if (!scroller || !viewer) return null;

    const pages = Array.from(viewer.querySelectorAll<HTMLElement>(".page"));
    if (pages.length === 0) return null;

    const scrollerRect = scroller.getBoundingClientRect();
    const centerY = scrollerRect.top + scrollerRect.height / 2;

    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < pages.length; i += 1) {
      const rect = pages[i].getBoundingClientRect();
      const intersectsCenter = rect.top <= centerY && rect.bottom >= centerY;
      const dist = intersectsCenter ? 0 : Math.min(Math.abs(rect.top - centerY), Math.abs(rect.bottom - centerY));
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
        if (dist === 0) break;
      }
    }
    return bestIdx + 1;
  };

  const syncCurrentPage = () => {
    const n = getCurrentPageNumberFromViewport();
    if (!n) return;
    setCurrentPage((prev) => (prev === n ? prev : n));
    if (!isEditingPage) setPageInput(String(n));
  };

  useEffect(() => {
    // Keep current page in sync as we scroll.
    const scroller = scrollRef.current;
    if (!scroller) return;
    let raf: number | null = null;
    const onScroll = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        syncCurrentPage();
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    // Initial sync after mount/doc load.
    syncCurrentPage();
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      scroller.removeEventListener("scroll", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, isEditingPage]);

  useEffect(() => {
    if (!isSearchOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (toolbarRef.current?.contains(t)) return;
      setIsSearchOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isSearchOpen]);

  // Debounced save of reading position
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!bookId || currentPage < 1) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      fetch(`/api/books/${bookId}/reading-position`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPage }),
      }).catch(() => {});
    }, 1000);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [bookId, currentPage]);

  const requestAiRun = (action: "page" | "selection") => {
    aiNonceRef.current += 1;
    setAiRequest({ nonce: aiNonceRef.current, action });
  };

  const goToPage = (pageNumber: number) => {
    const viewer = viewerRef.current;
    const scroller = scrollRef.current;
    if (!viewer || !scroller) return;
    const pages = Array.from(viewer.querySelectorAll<HTMLElement>(".page"));
    if (pages.length === 0) return;
    const clamped = Math.max(1, Math.min(pageNumber, pages.length));
    const el = pages[clamped - 1];
    const scrollerRect = scroller.getBoundingClientRect();
    const pageRect = el.getBoundingClientRect();
    const deltaY = pageRect.top - scrollerRect.top;
    scroller.scrollTop = scroller.scrollTop + deltaY - 12;
    setCurrentPage(clamped);
    setPageInput(String(clamped));
  };

  const commitPageInput = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(currentPage));
      return;
    }
    goToPage(parsed);
  };

  const ZOOM_STEP = 0.25;
  const zoomBy = (delta: number) => {
    setRenderScale((s) => clamp(s + delta, MIN_RENDER_SCALE, MAX_RENDER_SCALE));
  };

  useEffect(() => {
    // If the user transitions into mobile layout (or we adjust the threshold),
    // clamp the current scale to the new min/max range.
    setRenderScale((s) => clamp(s, MIN_RENDER_SCALE, MAX_RENDER_SCALE));
  }, [MIN_RENDER_SCALE]);

  // iOS safe-area support is surprisingly inconsistent across Safari vs in-app webviews.
  // Avoid CSS `max()` here: if unsupported, the whole value becomes invalid and `top` falls back,
  // which can put the bar under the notch. `env(..., 0px)` is widely supported and safe.
  const mobileSafeTop = "env(safe-area-inset-top, 0px)";

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    setLoading(true);
    setError(null);

    (async () => {
      // IMPORTANT: `pdfjs-dist` must be imported only in the browser.
      // Importing it on the server (SSR) can crash with `DOMMatrix is not defined`.
      const pdfjs = await import("pdfjs-dist");

      const workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

      const baseParams: Record<string, unknown> = { url: pdfUrl };

      // Some mobile browsers can be flaky with module workers; fall back to main-thread parsing.
      const canUseWorker =
        typeof Worker !== "undefined" &&
        // iOS Safari is the most common trouble spot; be conservative.
        !/iPad|iPhone|iPod/.test(navigator.userAgent);

      const tryLoad = async (params: Record<string, unknown>) => {
        loadingTask = pdfjs.getDocument(params) as unknown as PDFDocumentLoadingTask;
        return await loadingTask.promise;
      };

      let pdf: PDFDocumentProxy;
      try {
        pdf = await tryLoad({ ...baseParams, disableWorker: !canUseWorker });
      } catch {
        // Retry once without worker as a safety net.
        pdf = await tryLoad({ ...baseParams, disableWorker: true });
      }
      if (cancelled) return;
      setPdfDoc(pdf);
      setLoading(false);
    })().catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load PDF");
        setLoading(false);
      });

    return () => {
      cancelled = true;
      try {
        loadingTask?.destroy?.();
      } catch {
        // ignore
      }
    };
  }, [pdfUrl]);

  // Scroll to initial page when PDF loads (pages may render async)
  const initialPageScrolledRef = useRef(false);
  useEffect(() => {
    if (!pdfDoc || !initialPage || initialPage < 1 || initialPageScrolledRef.current) return;
    let attempts = 0;
    const maxAttempts = 10;
    const tryScroll = () => {
      attempts += 1;
      const viewer = viewerRef.current;
      const scroller = scrollRef.current;
      if (!viewer || !scroller) {
        if (attempts < maxAttempts) setTimeout(tryScroll, 50);
        return;
      }
      const pages = Array.from(viewer.querySelectorAll<HTMLElement>(".page"));
      if (pages.length === 0) {
        if (attempts < maxAttempts) setTimeout(tryScroll, 50);
        return;
      }
      initialPageScrolledRef.current = true;
      const clamped = Math.max(1, Math.min(initialPage, pages.length));
      const el = pages[clamped - 1];
      const scrollerRect = scroller.getBoundingClientRect();
      const pageRect = el.getBoundingClientRect();
      const deltaY = pageRect.top - scrollerRect.top;
      scroller.scrollTop = scroller.scrollTop + deltaY - 12;
      setCurrentPage(clamped);
      setPageInput(String(clamped));
    };
    const id = setTimeout(tryScroll, 50);
    return () => clearTimeout(id);
  }, [pdfDoc, initialPage]);

  useEffect(() => {
    // iOS Safari emits non-standard gesture events for pinch.
    // Prevent default so pinching the PDF doesn't trigger browser/OS gestures.
    const el = scrollRef.current;
    if (!el) return;
    const prevent = (e: Event) => {
      if (typeof e.cancelable === "boolean" && e.cancelable) e.preventDefault();
    };
    el.addEventListener("gesturestart", prevent, { passive: false });
    el.addEventListener("gesturechange", prevent, { passive: false });
    el.addEventListener("gestureend", prevent, { passive: false });
    return () => {
      el.removeEventListener("gesturestart", prevent);
      el.removeEventListener("gesturechange", prevent);
      el.removeEventListener("gestureend", prevent);
    };
  }, []);

  useEffect(() => {
    const pending = pendingScrollAdjustRef.current;
    if (!pending) return;
    pendingScrollAdjustRef.current = null;

    // Wait for layout to react (pages will re-render at the new scale).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const scroller = scrollRef.current;
        if (!scroller) return;
        scroller.scrollLeft = pending.anchorX * pending.ratio - pending.midOffsetX;
        scroller.scrollTop = pending.anchorY * pending.ratio - pending.midOffsetY;
      });
    });
  }, [renderScale]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error || !pdfDoc) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">PDF Load Error</h1>
          <p className="text-muted-foreground">{error || "Unable to load PDF."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex flex-col h-full relative">
          {(!isMobile || chromeVisible) && (
            <>
              {isMobile && (
                // Background "sheet" that fills the notch/safe-area region too,
                // while keeping the interactive bar content below it.
                <div
                  className="absolute top-0 left-0 right-0 z-50 border-b/60 bg-background/90 backdrop-blur pointer-events-none"
                  style={{ paddingTop: mobileSafeTop }}
                />
              )}
              <div
                ref={toolbarRef}
                className={[
                  "relative grid grid-cols-[1fr_auto_1fr] items-center px-4 border-b bg-background text-foreground pointer-events-auto",
                  // On mobile, overlay instead of docking (avoid reflow/layout shift).
                  isMobile
                    ? "absolute left-0 right-0 z-50 border-b/60 bg-background/90 backdrop-blur py-2"
                    : "py-2",
                ].join(" ")}
                style={isMobile ? { top: mobileSafeTop } : undefined}
              >
                <div className="min-w-0 flex items-center gap-2 justify-self-start">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-ml-2 shrink-0"
                    onClick={() => router.back()}
                    aria-label="Back"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </div>

                <div className="flex items-center justify-center gap-2 min-w-0 justify-self-center">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => zoomBy(-ZOOM_STEP)}
                      aria-label="Zoom out"
                      title="Zoom out"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => zoomBy(ZOOM_STEP)}
                      aria-label="Zoom in"
                      title="Zoom in"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <Input
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    onFocus={() => setIsEditingPage(true)}
                    onBlur={() => {
                      setIsEditingPage(false);
                      commitPageInput();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.currentTarget as HTMLInputElement).blur();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setPageInput(String(currentPage));
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                    inputMode="numeric"
                    aria-label="Current page"
                    className="h-8 w-16 text-center"
                  />
                  <span className="text-sm text-muted-foreground select-none">
                    / {pdfDoc.numPages}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0 justify-self-end">
                  <ThemeSwitcher />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSearchOpen((v) => !v)}
                    aria-label="Search"
                    title="Search"
                    className="shrink-0"
                  >
                    <Search className="h-5 w-5" />
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => requestAiRun("selection")}
                    disabled={!selectionExists}
                    aria-label="Explain selection"
                    title={selectionExists ? "Explain selection" : "Select text to explain"}
                    className="hidden md:inline-flex"
                  >
                    <Highlighter className="h-4 w-4 mr-2" />
                    Explain selection
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => requestAiRun("page")}
                    aria-label="Explain page"
                    title="Explain page"
                    className="hidden md:inline-flex"
                  >
                    <BookOpenText className="h-4 w-4 mr-2" />
                    Explain page
                  </Button>

                  {!isAiPaneOpen && (
                    <Button
                      variant="default"
                      onClick={() => {
                        openAiNonceRef.current += 1;
                        setOpenAiRequest({ nonce: openAiNonceRef.current });
                      }}
                      aria-label="Ask Minerva"
                      title="Ask Minerva"
                      className="hidden md:inline-flex"
                    >
                      Ask Minerva
                    </Button>
                  )}
                </div>

                {isSearchOpen && (
                  <div className="absolute right-4 top-full mt-2 z-50 w-[min(520px,calc(100vw-2rem))] rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-3">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant={searchMode === "normal" ? "default" : "outline"}
                        onClick={() => setSearchMode("normal")}
                        className="h-8"
                      >
                        Normal
                      </Button>
                      <Button
                        type="button"
                        variant={searchMode === "semantic" ? "default" : "outline"}
                        onClick={() => setSearchMode("semantic")}
                        className="h-8"
                        title="Semantic search (vector matches) - not implemented yet"
                      >
                        Semantic
                      </Button>
                      <div className="flex-1" />
                      <Button type="button" variant="ghost" size="icon" onClick={() => setIsSearchOpen(false)} aria-label="Close search">
                        <span className="text-lg leading-none">×</span>
                      </Button>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={searchMode === "semantic" ? "Search by meaning..." : "Search text..."}
                        className="h-9 flex-1"
                      />
                      <Button type="button" disabled={!searchQuery.trim()} title="Search (not implemented yet)">
                        Search
                      </Button>
                    </div>

                    <div className="mt-3 text-sm text-muted-foreground">
                      {searchMode === "semantic" ? (
                        <p>Semantic search results will appear here (top vector matches). Not implemented yet.</p>
                      ) : (
                        <p>Text search results will appear here. Not implemented yet.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          <div
            className="flex-1 overflow-auto bg-muted/20"
            ref={scrollRef}
            onPointerDown={(e) => {
              if (!isMobile) return;

              // Global pinch-to-zoom (two pointers) across ALL pages.
              // This updates a temporary transform for responsive feedback,
              // then commits the new `renderScale` on release (re-rendering all pages).
              const scroller = scrollRef.current;
              if (!scroller) return;
              pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

              if (pointersRef.current.size === 2) {
                const pts = Array.from(pointersRef.current.values());
                const dx = pts[0].x - pts[1].x;
                const dy = pts[0].y - pts[1].y;
                const dist = Math.hypot(dx, dy) || 1;
                const midClientX = (pts[0].x + pts[1].x) / 2;
                const midClientY = (pts[0].y + pts[1].y) / 2;
                const scrollRect = scroller.getBoundingClientRect();

                const anchorX = scroller.scrollLeft + (midClientX - scrollRect.left);
                const anchorY = scroller.scrollTop + (midClientY - scrollRect.top);

                pinchStartRef.current = {
                  startRenderScale: renderScale,
                  startDist: dist,
                  anchorX,
                  anchorY,
                  scrollLeft: scroller.scrollLeft,
                  scrollTop: scroller.scrollTop,
                  scrollRectLeft: scrollRect.left,
                  scrollRectTop: scrollRect.top,
                  lastMidOffsetX: midClientX - scrollRect.left,
                  lastMidOffsetY: midClientY - scrollRect.top,
                };
                lastCombinedScaleRef.current = renderScale;
                setGesture({ active: true, scale: 1, tx: 0, ty: 0 });
              }

              // Only consider single-pointer taps for the center-toggle gesture.
              if (e.isPrimary === false) return;
              tapRef.current = {
                pointerId: e.pointerId,
                x: e.clientX,
                y: e.clientY,
                t: Date.now(),
                moved: false,
              };
            }}
            onPointerMove={(e) => {
              if (!isMobile) return;

              // Global pinch move
              if (pointersRef.current.has(e.pointerId)) {
                pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

                const start = pinchStartRef.current;
                if (start && pointersRef.current.size === 2) {
                  const pts = Array.from(pointersRef.current.values());
                  const midClientX = (pts[0].x + pts[1].x) / 2;
                  const midClientY = (pts[0].y + pts[1].y) / 2;
                  const dx = pts[0].x - pts[1].x;
                  const dy = pts[0].y - pts[1].y;
                  const dist = Math.hypot(dx, dy) || 1;

                  const rawCombined = start.startRenderScale * (dist / start.startDist);
                  const combined = clamp(rawCombined, MIN_RENDER_SCALE, MAX_RENDER_SCALE);
                  lastCombinedScaleRef.current = combined;

                  const gScale = combined / start.startRenderScale;

                  const midOffsetX = midClientX - start.scrollRectLeft;
                  const midOffsetY = midClientY - start.scrollRectTop;
                  start.lastMidOffsetX = midOffsetX;
                  start.lastMidOffsetY = midOffsetY;

                  // Keep the anchor point under the midpoint stable:
                  // screenX = rectLeft + (tx + gScale*anchorX - scrollLeft)
                  const tx = midOffsetX + start.scrollLeft - gScale * start.anchorX;
                  const ty = midOffsetY + start.scrollTop - gScale * start.anchorY;
                  setGesture({ active: true, scale: gScale, tx, ty });
                }
              }

              const t = tapRef.current;
              if (!t || t.pointerId !== e.pointerId) return;
              if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) t.moved = true;
            }}
            onPointerUp={(e) => {
              if (!isMobile) return;

              // End global pinch if needed (commit `renderScale` so all pages re-render).
              if (pointersRef.current.has(e.pointerId)) {
                pointersRef.current.delete(e.pointerId);
                if (pointersRef.current.size < 2 && pinchStartRef.current) {
                  const start = pinchStartRef.current;
                  pinchStartRef.current = null;

                  const nextRenderScale = clamp(
                    lastCombinedScaleRef.current,
                    MIN_RENDER_SCALE,
                    MAX_RENDER_SCALE,
                  );
                  const ratio = nextRenderScale / start.startRenderScale;

                  pendingScrollAdjustRef.current = {
                    anchorX: start.anchorX,
                    anchorY: start.anchorY,
                    midOffsetX: start.lastMidOffsetX,
                    midOffsetY: start.lastMidOffsetY,
                    ratio,
                  };

                  setGesture({ active: false, scale: 1, tx: 0, ty: 0 });
                  setRenderScale(nextRenderScale);
                }
              }

              const t = tapRef.current;
              tapRef.current = null;
              if (!t || t.pointerId !== e.pointerId) return;

              const dt = Date.now() - t.t;
              if (t.moved || dt > 350) return;

              // Ignore taps on obvious interactive elements.
              const target = e.target as HTMLElement | null;
              if (target?.closest("button,a,input,textarea,select,[role='button']")) return;

              // Only toggle when tapping near the center of the viewport.
              const cx0 = window.innerWidth * 0.25;
              const cx1 = window.innerWidth * 0.75;
              const cy0 = window.innerHeight * 0.25;
              const cy1 = window.innerHeight * 0.75;
              if (e.clientX < cx0 || e.clientX > cx1 || e.clientY < cy0 || e.clientY > cy1) return;

              setChromeVisible((v) => !v);
            }}
            onPointerCancel={() => {
              pointersRef.current.clear();
              pinchStartRef.current = null;
              setGesture({ active: false, scale: 1, tx: 0, ty: 0 });
              tapRef.current = null;
            }}
          >
            <div
              ref={viewerRef}
              className="pdfViewer max-w-4xl mx-auto py-6 space-y-6"
              style={
                gesture.active
                  ? {
                      transform: `translate3d(${gesture.tx}px, ${gesture.ty}px, 0) scale(${gesture.scale})`,
                      transformOrigin: "0 0",
                      willChange: "transform",
                    }
                  : undefined
              }
              onDoubleClick={() => setRenderScale(1)}
            >
              {Array.from({ length: pdfDoc.numPages }, (_, idx) => (
                <LazyPdfPage key={idx + 1} pdf={pdfDoc} pageNumber={idx + 1} scale={renderScale} />
              ))}
            </div>
          </div>
          {PDF_DEBUG_ENABLED && (!isMobile || chromeVisible) && (
            <div className="bg-background border-t border-border shadow-lg">
              <button
                onClick={() => setIsDebugPanelOpen(!isDebugPanelOpen)}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium">Debug</span>
                <span className="text-xs text-muted-foreground">
                  {isDebugPanelOpen ? "Hide" : "Show"}
                </span>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  isDebugPanelOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <div className="px-4 py-3">
                  <Button
                    onClick={async () => {
                      const positions = getCurrentPdfSelectionPosition();
                      if (!positions) return;
                      console.log("Selection start position:", positions.start);
                      console.log("Selection end position:", positions.end);
                      console.log("Selected text:", window.getSelection()?.toString().trim() || "");

                      const summaries = await queryPdfSummariesForPosition(
                        bookId,
                        positions.start,
                        positions.end,
                      );

                      console.log("Matching summaries:", summaries);
                    }}
                    variant="default"
                    className="w-full"
                  >
                    Log Position
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative h-full flex-none">
        {/* Mobile: AI drawer follows the same chrome/menu toggle as the top bar. */}
        {(!isMobile || chromeVisible) && (
          <AIAssistant
            selectedText={selectedText}
            bookId={bookId}
            bookType="pdf"
            currentPage={currentPage}
            pdfDocument={pdfDoc}
            mobileDrawerMinMode={selectionExists ? "quick" : "closed"}
            requestRun={aiRequest}
            requestOpen={openAiRequest}
            onOpenChange={setIsAiPaneOpen}
          />
        )}
      </div>
    </div>
  );
}

interface PdfPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale?: number;
}

function LazyPdfPage({ pdf, pageNumber, scale }: PdfPageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(pageNumber <= 2);

  useEffect(() => {
    if (shouldRender) return;
    const el = hostRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setShouldRender(true);
          obs.disconnect();
        }
      },
      // Start rendering before it scrolls into view.
      { root: null, rootMargin: "1200px 0px", threshold: 0.01 },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [shouldRender]);

  return (
    <div ref={hostRef}>
      {shouldRender ? (
        <PdfPage pdf={pdf} pageNumber={pageNumber} scale={scale} />
      ) : (
        <div className="w-full flex justify-center">
          <div className="page relative shadow-sm border bg-white w-full max-w-4xl">
            <div className="w-full" style={{ aspectRatio: "1 / 1.4142" }} />
          </div>
        </div>
      )}
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function PdfPage({ pdf, pageNumber, scale = 1 }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerHostRef = useRef<HTMLDivElement | null>(null);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel?: () => void; promise: Promise<unknown> } | null =
      null;
    // pdfjs' TextLayerBuilder types vary across versions; keep this loose.
    // Cast at the assignment site to avoid TypeScript variance issues across versions.
    let textLayerBuilder: {
      cancel?: () => void;
      render?: (opts: { viewport: unknown }) => Promise<unknown>;
    } | null = null;

    const render = async () => {
      const { PixelsPerInch, setLayerDimensions } = await import("pdfjs-dist");
      const page = await pdf.getPage(pageNumber);
      if (
        cancelled ||
        !canvasRef.current ||
        !textLayerHostRef.current ||
        !pageContainerRef.current
      ) {
        return;
      }

      // Fit-to-width by default on mobile to avoid the "stuck zoomed-in" feeling.
      const containerWidth =
        pageContainerRef.current.parentElement?.clientWidth || pageContainerRef.current.clientWidth;
      const baseViewport = page.getViewport({ scale: PixelsPerInch.PDF_TO_CSS_UNITS });
      const fitFactor = containerWidth
        ? clamp(containerWidth / baseViewport.width, 0.5, 2.5)
        : 1;

      const viewport = page.getViewport({
        scale: scale * fitFactor * PixelsPerInch.PDF_TO_CSS_UNITS,
      });
      const outputScale = window.devicePixelRatio || 1;

      pageContainerRef.current.style.setProperty("--scale-factor", viewport.scale.toString());
      setLayerDimensions(pageContainerRef.current, viewport);

      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
      renderTask = page.render({ canvas, canvasContext: context, viewport, transform });
      await renderTask.promise;

      const { TextLayerBuilder } = await import("pdfjs-dist/web/pdf_viewer.mjs");
      if (cancelled) return;

      const textLayerHost = textLayerHostRef.current;
      textLayerHost.innerHTML = "";
      textLayerHost.style.setProperty("--scale-factor", viewport.scale.toString());
      setLayerDimensions(textLayerHost, viewport);

      textLayerBuilder = new TextLayerBuilder({
        pdfPage: page,
        onAppend: (div: HTMLDivElement) => {
          const textNodes = Array.from(div.querySelectorAll("span"));
          textNodes.forEach((node, index) => {
            node.dataset.itemIndex = index.toString();
            node.dataset.pageNumber = pageNumber.toString();
          });
          textLayerHost.appendChild(div);
        },
      }) as unknown as { cancel?: () => void; render?: (opts: { viewport: unknown }) => Promise<unknown> };

      await textLayerBuilder?.render?.({ viewport });
    };

    render().catch(() => {
      // noop: error handled by parent
    });

    return () => {
      cancelled = true;
      if (renderTask?.cancel) renderTask.cancel();
      textLayerBuilder?.cancel?.();
    };
  }, [pdf, pageNumber, scale]);

  return (
    <div className="w-full flex justify-center">
      <div ref={pageContainerRef} className="page relative shadow-sm border bg-white">
        <div className="canvasWrapper">
          <canvas ref={canvasRef} className="pointer-events-none block" />
        </div>
        <div ref={textLayerHostRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
