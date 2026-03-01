"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Bookmark,
  BookOpenText,
  Highlighter,
  LayoutGrid,
  List,
  Minus,
  Plus,
  Search,
  X,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useRouter } from "next/navigation";
import { AIAssistant } from "@/components/ai-assistant";
import { useSelectedText } from "@/lib/use-selected-text";
import { useIsMobile } from "@/lib/use-media-query";
import { getCachedPdf, setCachedPdf } from "@/lib/pdf-cache";

type PDFDocumentLoadingTask = {
  promise: Promise<PDFDocumentProxy>;
  destroy: () => void;
};

interface PdfReaderProps {
  pdfUrl: string;
  fileName?: string | null;
  bookId: string;
  initialPage?: number;
  initialBookmarks?: number[];
}

const MOBILE_PAGE_SIDE_MARGIN_PX = 2;
const MOBILE_FIT_WIDTH_BUFFER_PX = 2;

function isPdfDebugEnabled() {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return true;
  try {
    const query = new URLSearchParams(window.location.search);
    if (query.has("pdfDebug")) return true;
    if (window.localStorage.getItem("pdfDebug") === "1") return true;
    return Boolean((window as Window & { __PDF_DEBUG__?: boolean }).__PDF_DEBUG__);
  } catch {
    return false;
  }
}

export function PdfReader({ pdfUrl, bookId, initialPage, initialBookmarks }: PdfReaderProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedText = useSelectedText();
  const selectionExists = Boolean(selectedText && selectedText.trim().length > 0);
  const router = useRouter();
  const isMobile = useIsMobile();
  const [chromeVisible, setChromeVisible] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const aiPaneContainerRef = useRef<HTMLDivElement | null>(null);

  const [currentPage, setCurrentPage] = useState(initialPage ?? 1);
  const [pageInput, setPageInput] = useState(String(initialPage ?? 1));
  const [isEditingPage, setIsEditingPage] = useState(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<"normal" | "semantic">("normal");
  const [searchQuery, setSearchQuery] = useState("");
  const [pdfOutline, setPdfOutline] = useState<Array<{ title: string; dest?: unknown; items?: unknown[] }> | null>(null);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [tocDrawerMode, setTocDrawerMode] = useState<"contents" | "pages" | "bookmarks">("contents");
  const [bookmarks, setBookmarks] = useState<number[]>(initialBookmarks ?? []);
  const lastSyncedRef = useRef<string>(JSON.stringify([...(initialBookmarks ?? [])].sort((a, b) => a - b)));
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTocPageRef = useRef<number | null>(null);

  useEffect(() => {
    setBookmarks(initialBookmarks ?? []);
    lastSyncedRef.current = JSON.stringify([...(initialBookmarks ?? [])].sort((a, b) => a - b));
  }, [initialBookmarks]);

  useEffect(() => {
    if (initialBookmarks === undefined) return;
    const current = JSON.stringify([...bookmarks].sort((a, b) => a - b));
    if (current === lastSyncedRef.current) return;
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      syncTimeoutRef.current = null;
      const toSync = [...bookmarks].sort((a, b) => a - b);
      fetch(`/api/books/${bookId}/bookmarks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookmarks: toSync }),
      })
        .then((res) => {
          if (res.ok) lastSyncedRef.current = JSON.stringify(toSync);
        })
        .catch(() => {});
    }, 1500);
    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [bookId, bookmarks, initialBookmarks]);

  const toggleBookmark = () => {
    if (initialBookmarks === undefined) return;
    const page = currentPage;
    setBookmarks((prev) => {
      const wasBookmarked = prev.includes(page);
      return wasBookmarked
        ? prev.filter((p) => p !== page)
        : [...prev, page].sort((a, b) => a - b);
    });
  };

  const openTocDrawer = () => {
    if (!pdfOutline?.length) setTocDrawerMode("pages");
    setIsTocOpen(true);
  };


  const aiNonceRef = useRef(0);
  const [aiRequest, setAiRequest] = useState<{ nonce: number; action: "page" | "selection" } | null>(
    null,
  );
  const openAiNonceRef = useRef(0);
  const [openAiRequest, setOpenAiRequest] = useState<{ nonce: number } | null>(null);
  const [isAiPaneOpen, setIsAiPaneOpen] = useState(false);
  // Global PDF zoom (applies to ALL pages by re-rendering at a larger viewport scale).
  // This avoids per-page transforms that can cause "chopped" edges and makes scroll work naturally.
  // On mobile, default to true fit-width so rendered pages match the layout shell.
  const MIN_RENDER_SCALE_DESKTOP = 0.7;
  const MIN_RENDER_SCALE_MOBILE = 1;
  const MIN_RENDER_SCALE = isMobile ? MIN_RENDER_SCALE_MOBILE : MIN_RENDER_SCALE_DESKTOP;
  const MAX_RENDER_SCALE = 4;
  const [renderScale, setRenderScale] = useState(1);
  const isAtMobileMinScale = isMobile && renderScale <= MIN_RENDER_SCALE_MOBILE + 0.001;
  const isMobilePagedMode = isMobile;
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
        mode: "ratio";
        anchorX: number;
        anchorY: number;
        midOffsetX: number;
        midOffsetY: number;
        ratio: number;
      }
    | {
        mode: "page-anchor";
        pageNumber: number;
        pageOffsetXRatio: number;
        pageOffsetYRatio: number;
        midOffsetX: number;
        midOffsetY: number;
      }
    | null
  >(null);
  const tapRef = useRef<{ pointerId: number; x: number; y: number; t: number; moved: boolean } | null>(
    null,
  );
  const itemTextsCacheRef = useRef<Map<number, string[]>>(new Map());
  const debugEnabledRef = useRef(false);
  const logPdfDebug = (event: string, payload?: Record<string, unknown>) => {
    if (!debugEnabledRef.current) return;
    const stamp = new Date().toISOString();
    // Keep logs machine-readable and grouped by event.
    console.log(`[PdfDebug ${stamp}] ${event}`, payload ?? {});
  };

  useEffect(() => {
    debugEnabledRef.current = isPdfDebugEnabled();
    if (!debugEnabledRef.current) return;
    console.log("[PdfDebug] enabled. Dev mode logs by default; prod: use ?pdfDebug=1 or localStorage.pdfDebug=1");
  }, []);

  useEffect(() => {
    // Default to an "immersive" UI on mobile: tap center to reveal chrome.
    setChromeVisible(!isMobile);
  }, [isMobile]);

  const getCurrentPageNumberFromViewport = () => {
    const scroller = scrollRef.current;
    const viewer = viewerRef.current;
    if (!scroller || !viewer) return null;

    const pages = Array.from(viewer.querySelectorAll<HTMLElement>(".page"));
    if (pages.length === 0) return null;

    const scrollerRect = scroller.getBoundingClientRect();
    if (isMobilePagedMode) {
      const centerX = scrollerRect.left + scrollerRect.width / 2;
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < pages.length; i += 1) {
        const rect = pages[i].getBoundingClientRect();
        const intersectsCenter = rect.left <= centerX && rect.right >= centerX;
        const dist = intersectsCenter ? 0 : Math.min(Math.abs(rect.left - centerX), Math.abs(rect.right - centerX));
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
          if (dist === 0) break;
        }
      }
      return bestIdx + 1;
    }

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
    // Re-run when isTocOpen changes: on mobile, the reader (and scroll div) unmount when TOC opens,
    // so we must re-attach the listener when returning to the reader.
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
  }, [pdfDoc, loading, isEditingPage, isTocOpen]);

  // When closing mobile TOC, scroll to the page that was selected (reader was unmounted during selection).
  useEffect(() => {
    if (!isMobile || isTocOpen || !pendingTocPageRef.current) return;
    const page = pendingTocPageRef.current;
    pendingTocPageRef.current = null;
    requestAnimationFrame(() => {
      goToPage(page);
    });
  }, [isMobile, isTocOpen]);

  const handleTocSelectPage = (pageNum: number) => {
    if (isMobile && isTocOpen) {
      pendingTocPageRef.current = pageNum;
      setIsTocOpen(false);
    } else {
      goToPage(pageNum);
      setIsTocOpen(false);
    }
  };

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
    const payload = { nonce: aiNonceRef.current, action };
    setAiRequest(payload);
    setIsAiPaneOpen(true); // Open pane immediately so we don't rely on onOpenChange (which can unmount panel)
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
    if (isMobilePagedMode) {
      const deltaX = pageRect.left - scrollerRect.left;
      scroller.scrollLeft = scroller.scrollLeft + deltaX;
    } else {
      const deltaY = pageRect.top - scrollerRect.top;
      scroller.scrollTop = scroller.scrollTop + deltaY - 12;
    }
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

  const ZOOM_STEP = 0.1;
  const zoomBy = (delta: number) => {
    if (delta === 0) return;
    const scroller = scrollRef.current;
    const viewer = viewerRef.current;
    const nextScale = clamp(renderScale + delta, MIN_RENDER_SCALE, MAX_RENDER_SCALE);
    if (nextScale === renderScale) return;
    logPdfDebug("zoomBy:start", {
      delta,
      renderScale,
      nextScale,
      isMobile,
      currentPage,
      hasScroller: Boolean(scroller),
      hasViewer: Boolean(viewer),
    });

    if (scroller && viewer) {
      const rect = scroller.getBoundingClientRect();
      const midOffsetX = rect.width / 2;
      const midOffsetY = rect.height / 2;
      const pages = Array.from(viewer.querySelectorAll<HTMLElement>(".page"));
      const pageNumber = getCurrentPageNumberFromViewport() ?? currentPage;
      const pageEl = pages[pageNumber - 1];
      if (pageEl) {
        const pageRect = pageEl.getBoundingClientRect();
        const viewportMidX = rect.left + midOffsetX;
        const viewportMidY = rect.top + midOffsetY;
        // Keep exact relative position against the current page without clamping.
        // Clamping to [0,1] can cause lateral drift when zoom/layout transitions cross centering boundaries.
        const pageOffsetXRatio = (viewportMidX - pageRect.left) / Math.max(1, pageRect.width);
        const pageOffsetYRatio = (viewportMidY - pageRect.top) / Math.max(1, pageRect.height);
        pendingScrollAdjustRef.current = {
          mode: "page-anchor",
          pageNumber,
          pageOffsetXRatio,
          pageOffsetYRatio,
          midOffsetX,
          midOffsetY,
        };
        logPdfDebug(isMobile ? "zoomBy:page-anchor-mobile" : "zoomBy:page-anchor-desktop", {
          pageNumber,
          pageOffsetXRatio,
          pageOffsetYRatio,
          midOffsetX,
          midOffsetY,
          pageRectLeft: pageRect.left,
          pageRectTop: pageRect.top,
          pageRectWidth: pageRect.width,
          pageRectHeight: pageRect.height,
        });
      } else {
        const ratio = nextScale / renderScale;
        const anchorX = scroller.scrollLeft + midOffsetX;
        const anchorY = scroller.scrollTop + midOffsetY;
        pendingScrollAdjustRef.current = {
          mode: "ratio",
          anchorX,
          anchorY,
          midOffsetX,
          midOffsetY,
          ratio,
        };
        logPdfDebug("zoomBy:ratio-fallback", {
          anchorX,
          anchorY,
          midOffsetX,
          midOffsetY,
          ratio,
        });
      }
    } else if (scroller) {
      const rect = scroller.getBoundingClientRect();
      const ratio = nextScale / renderScale;
      const anchorX = scroller.scrollLeft + rect.width / 2;
      const anchorY = scroller.scrollTop + rect.height / 2;
      pendingScrollAdjustRef.current = {
        mode: "ratio",
        anchorX,
        anchorY,
        midOffsetX: rect.width / 2,
        midOffsetY: rect.height / 2,
        ratio,
      };
      logPdfDebug("zoomBy:scroller-only", {
        anchorX,
        anchorY,
        ratio,
      });
    }
    setRenderScale(nextScale);
  };

  useEffect(() => {
    // If the user transitions into mobile layout (or we adjust the threshold),
    // clamp the current scale to the new min/max range.
    setRenderScale((s) => clamp(s, MIN_RENDER_SCALE, MAX_RENDER_SCALE));
  }, [MIN_RENDER_SCALE]);

  // On mobile, initialize to min scale (fit-width by default).
  // Must run after the clamp effect so we don't get overwritten.
  useEffect(() => {
    if (isMobile && pdfDoc) {
      setRenderScale(MIN_RENDER_SCALE_MOBILE);
    }
  }, [isMobile, pdfDoc]);

  useEffect(() => {
    if (!isMobile) return;
    if (!pdfDoc) return;
    if (renderScale > MIN_RENDER_SCALE_MOBILE + 0.001) return;

    const scroller = scrollRef.current;
    if (!scroller) return;

    requestAnimationFrame(() => {
      const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      if (maxScrollLeft <= 1) {
        // No real horizontal overflow at min zoom: prevent tiny subpixel drift.
        scroller.scrollLeft = 0;
        return;
      }
      // Avoid introducing horizontal drift from tiny subpixel overflow.
      if (maxScrollLeft < 12) {
        scroller.scrollLeft = 0;
      } else {
        // For larger overflow, keep scroll position valid but don't force recenter while zoomed in.
        scroller.scrollLeft = Math.min(Math.max(0, scroller.scrollLeft), maxScrollLeft);
      }
    });
  }, [isMobile, pdfDoc, renderScale, MIN_RENDER_SCALE_MOBILE]);

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

      // Some mobile browsers can be flaky with module workers; fall back to main-thread parsing.
      const canUseWorker =
        typeof Worker !== "undefined" &&
        // iOS Safari is the most common trouble spot; be conservative.
        !/iPad|iPhone|iPod/.test(navigator.userAgent);

      const tryLoad = async (params: Record<string, unknown>) => {
        loadingTask = pdfjs.getDocument(params) as unknown as PDFDocumentLoadingTask;
        return await loadingTask.promise;
      };

      let data: ArrayBuffer;
      const cached = await getCachedPdf(bookId);
      if (cached) {
        data = cached;
      } else {
        const res = await fetch(pdfUrl);
        if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`);
        data = await res.arrayBuffer();
        await setCachedPdf(bookId, data);
      }
      if (cancelled) return;

      const baseParams: Record<string, unknown> = {
        data,
        disableWorker: !canUseWorker,
      };

      let pdf: PDFDocumentProxy;
      try {
        pdf = await tryLoad(baseParams);
      } catch {
        // Retry once without worker as a safety net.
        pdf = await tryLoad({ ...baseParams, disableWorker: true });
      }
      if (cancelled) return;
      setPdfDoc(pdf);
      try {
        const outline = await pdf.getOutline();
        if (cancelled) return;
        setPdfOutline(outline && outline.length > 0 ? outline : null);
      } catch {
        setPdfOutline(null);
      }
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
  }, [pdfUrl, bookId]);

  useEffect(() => {
    if (!isMobile) return;
    // iOS Safari emits non-standard gesture events for pinch.
    // Prevent default so pinching the reader chrome doesn't trigger browser/OS zoom.
    const gestureSafeElements = [
      scrollRef.current,
      toolbarRef.current,
      aiPaneContainerRef.current,
    ].filter((el): el is HTMLDivElement => Boolean(el));
    if (gestureSafeElements.length === 0) return;
    const prevent = (e: Event) => {
      if (typeof e.cancelable === "boolean" && e.cancelable) e.preventDefault();
    };
    for (const el of gestureSafeElements) {
      el.addEventListener("gesturestart", prevent, { passive: false });
      el.addEventListener("gesturechange", prevent, { passive: false });
      el.addEventListener("gestureend", prevent, { passive: false });
    }
    return () => {
      for (const el of gestureSafeElements) {
        el.removeEventListener("gesturestart", prevent);
        el.removeEventListener("gesturechange", prevent);
        el.removeEventListener("gestureend", prevent);
      }
    };
  }, [isMobile, chromeVisible]);

  useEffect(() => {
    const pending = pendingScrollAdjustRef.current;
    if (!pending) return;
    pendingScrollAdjustRef.current = null;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const scroller = scrollRef.current;
        const viewer = viewerRef.current;
        if (!scroller) return;
        logPdfDebug("scrollAdjust:before", {
          pendingMode: pending.mode,
          scrollLeft: scroller.scrollLeft,
          scrollTop: scroller.scrollTop,
          scrollWidth: scroller.scrollWidth,
          scrollHeight: scroller.scrollHeight,
          clientWidth: scroller.clientWidth,
          clientHeight: scroller.clientHeight,
        });
        if (pending.mode === "page-anchor" && viewer) {
          const pages = Array.from(viewer.querySelectorAll<HTMLElement>(".page"));
          const pageEl = pages[pending.pageNumber - 1];
          if (!pageEl) return;

          const scrollerRect = scroller.getBoundingClientRect();
          const pageRect = pageEl.getBoundingClientRect();
          const targetOffsetX = pageRect.width * pending.pageOffsetXRatio;
          const targetOffsetY = pageRect.height * pending.pageOffsetYRatio;
          scroller.scrollLeft =
            scroller.scrollLeft + (pageRect.left - scrollerRect.left) + targetOffsetX - pending.midOffsetX;
          scroller.scrollTop =
            scroller.scrollTop + (pageRect.top - scrollerRect.top) + targetOffsetY - pending.midOffsetY;
          logPdfDebug("scrollAdjust:after-page-anchor", {
            pageNumber: pending.pageNumber,
            targetOffsetX,
            targetOffsetY,
            scrollLeft: scroller.scrollLeft,
            scrollTop: scroller.scrollTop,
            maxScrollLeft: Math.max(0, scroller.scrollWidth - scroller.clientWidth),
            maxScrollTop: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
          });
          return;
        }

        if (pending.mode === "ratio") {
          scroller.scrollLeft = pending.anchorX * pending.ratio - pending.midOffsetX;
          scroller.scrollTop = pending.anchorY * pending.ratio - pending.midOffsetY;
          logPdfDebug("scrollAdjust:after-ratio", {
            anchorX: pending.anchorX,
            anchorY: pending.anchorY,
            ratio: pending.ratio,
            scrollLeft: scroller.scrollLeft,
            scrollTop: scroller.scrollTop,
            maxScrollLeft: Math.max(0, scroller.scrollWidth - scroller.clientWidth),
            maxScrollTop: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
          });
        }
      });
    });
  }, [renderScale]);

  useEffect(() => {
    if (!debugEnabledRef.current) return;
    const scroller = scrollRef.current;
    const viewer = viewerRef.current;
    const pageEls = viewer ? Array.from(viewer.querySelectorAll<HTMLElement>(".page")) : [];
    const renderedCanvasCount = viewer ? viewer.querySelectorAll("canvas").length : 0;
    logPdfDebug("scale:state", {
      renderScale,
      isMobile,
      currentPage,
      pageCountInDom: pageEls.length,
      renderedCanvasCount,
      scrollLeft: scroller?.scrollLeft ?? null,
      scrollTop: scroller?.scrollTop ?? null,
      maxScrollLeft: scroller ? Math.max(0, scroller.scrollWidth - scroller.clientWidth) : null,
      maxScrollTop: scroller ? Math.max(0, scroller.scrollHeight - scroller.clientHeight) : null,
    });
  }, [renderScale, currentPage, isMobile]);

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

  // Mobile: full-screen TOC takeover - no reader, AI, or toolbar
  if (isMobile && isTocOpen && pdfDoc) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="grid grid-cols-3 items-center px-4 py-3 border-b border-border shrink-0">
          <div />
          <div className="flex justify-center">
            <div className="inline-flex rounded-lg border border-border p-0.5" role="group">
              <button
                type="button"
                onClick={() => setTocDrawerMode("pages")}
                aria-label="Page thumbnails"
                className={`rounded-md p-2 transition-colors ${
                  tocDrawerMode === "pages"
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-5 w-5" />
              </button>
              {initialBookmarks !== undefined && (
                <button
                  type="button"
                  onClick={() => setTocDrawerMode("bookmarks")}
                  aria-label="Bookmarks"
                  className={`rounded-md p-2 transition-colors ${
                    tocDrawerMode === "bookmarks"
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Bookmark className="h-5 w-5" />
                </button>
              )}
              {pdfOutline && pdfOutline.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTocDrawerMode("contents")}
                  aria-label="Contents"
                  className={`rounded-md p-2 transition-colors ${
                    tocDrawerMode === "contents"
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <List className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsTocOpen(false)}
              aria-label="Close"
              className="h-10 w-10"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {tocDrawerMode === "contents" ? (
            pdfOutline && pdfOutline.length > 0 ? (
              <div className="p-4">
                <PdfTocList
                  items={pdfOutline}
                  pdfDoc={pdfDoc}
                  onSelectPage={handleTocSelectPage}
                  depth={0}
                  mobile
                />
              </div>
            ) : (
              <div className="p-4 text-base text-muted-foreground">
                No table of contents in this document.
              </div>
            )
          ) : tocDrawerMode === "bookmarks" ? (
            bookmarks.length === 0 ? (
              <div className="p-4 text-base text-muted-foreground">
                No bookmarks. Use the bookmark icon to save pages.
              </div>
            ) : (
              <div className="p-4">
                <PdfThumbnailList
                  pdf={pdfDoc}
                  currentPage={currentPage}
                  onSelectPage={handleTocSelectPage}
                  gridLayout="mobile"
                  pageFilter={bookmarks}
                />
              </div>
            )
          ) : (
            <div className="p-4">
              <PdfThumbnailList
                pdf={pdfDoc}
                currentPage={currentPage}
                onSelectPage={handleTocSelectPage}
                gridLayout="mobile"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full flex ${isMobile ? "h-svh" : "h-screen"}`}>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex flex-col h-full relative">
          {/* Desktop: toolbar docks in flow. Mobile: always rendered as overlay, visibility toggled (no layout shift). */}
          {!isMobile && (
            <div
              ref={toolbarRef}
              className="relative grid grid-cols-[1fr_auto_1fr] items-center px-4 border-b bg-background text-foreground py-2"
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
                  {initialBookmarks !== undefined && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleBookmark}
                      aria-label={bookmarks.includes(currentPage) ? "Remove bookmark" : "Bookmark page"}
                      title={bookmarks.includes(currentPage) ? "Remove bookmark" : "Bookmark page"}
                      className={`shrink-0 hover:bg-accent/80 ${
                        bookmarks.includes(currentPage)
                          ? "fill-red-500 text-red-500 hover:fill-red-600 hover:text-red-600 [&_path]:fill-red-500 [&_path]:stroke-red-500"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Bookmark className="h-5 w-5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={openTocDrawer}
                    aria-label="Table of contents"
                    title="Table of contents"
                    className="shrink-0 text-foreground hover:bg-accent/80 hover:text-accent-foreground"
                  >
                    <List className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSearchOpen((v) => !v)}
                    aria-label="Search"
                    title="Search"
                    className="shrink-0 text-foreground hover:bg-accent/80 hover:text-accent-foreground"
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
          )}
          {isMobile && (
            <>
              {/* Background "sheet" for notch/safe-area; hidden when chrome collapsed */}
              <div
                className={[
                  "absolute top-0 left-0 right-0 z-50 border-b/60 bg-background/90 backdrop-blur transition-opacity duration-200",
                  chromeVisible ? "opacity-100 pointer-events-none" : "opacity-0 pointer-events-none",
                ].join(" ")}
                style={{ paddingTop: mobileSafeTop }}
                aria-hidden={!chromeVisible}
              />
              <div
                ref={toolbarRef}
                className={[
                  "absolute left-0 right-0 z-50 grid grid-cols-[1fr_auto_1fr] items-center px-4 border-b border-border/60 bg-background/95 backdrop-blur text-foreground py-2 transition-opacity duration-200",
                  chromeVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
                ].join(" ")}
                style={{ top: mobileSafeTop, touchAction: "pan-x pan-y" }}
                aria-hidden={!chromeVisible}
              >
                <div className="min-w-0 flex items-center gap-2 justify-self-start">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-ml-2 shrink-0 text-foreground hover:bg-accent/80 hover:text-accent-foreground"
                    onClick={() => router.back()}
                    aria-label="Back"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </div>

                <div className="flex items-center justify-center gap-2 min-w-0 justify-self-center">
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
                  {initialBookmarks !== undefined && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleBookmark}
                      aria-label={bookmarks.includes(currentPage) ? "Remove bookmark" : "Bookmark page"}
                      title={bookmarks.includes(currentPage) ? "Remove bookmark" : "Bookmark page"}
                      className={`shrink-0 hover:bg-accent/80 ${
                        bookmarks.includes(currentPage)
                          ? "fill-red-500 text-red-500 hover:fill-red-600 hover:text-red-600 [&_path]:fill-red-500 [&_path]:stroke-red-500"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Bookmark className="h-5 w-5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={openTocDrawer}
                    aria-label="Table of contents"
                    title="Table of contents"
                    className="shrink-0 text-foreground hover:bg-accent/80 hover:text-accent-foreground"
                  >
                    <List className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSearchOpen((v) => !v)}
                    aria-label="Search"
                    title="Search"
                    className="shrink-0 text-foreground hover:bg-accent/80 hover:text-accent-foreground"
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
          <div className="relative flex-1 min-h-0 bg-background">
            <div
              className={`pdf-scroll-host absolute inset-0 bg-background ${
                isMobilePagedMode
                  ? "overflow-x-auto overflow-y-hidden overscroll-contain snap-x snap-mandatory"
                  : "overflow-auto"
              }`}
              ref={scrollRef}
              style={
                isMobilePagedMode
                  ? { touchAction: "pan-x pan-y" }
                  : isAtMobileMinScale
                    ? { overflowX: "hidden" }
                    : undefined
              }
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
                    mode: "ratio",
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
              <div className={isMobilePagedMode ? "w-full h-full" : isMobile ? "flex justify-center w-full" : "w-max min-w-full mx-auto"}>
              <div
                ref={viewerRef}
                className={`pdfViewer ${
                  isMobilePagedMode
                    ? "flex h-full w-full items-center py-0"
                    : `py-6 ${isMobile ? "space-y-1 w-full min-w-0 max-w-none" : "space-y-3 min-w-max"}`
                }`}
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
                  <LazyPdfPage
                    key={idx + 1}
                    pdf={pdfDoc}
                    pageNumber={idx + 1}
                    scale={renderScale}
                    scrollContainerRef={scrollRef}
                    isMobile={isMobile}
                    mobilePagedMode={isMobilePagedMode}
                    itemTextsCacheRef={itemTextsCacheRef}
                  />
                ))}
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        ref={aiPaneContainerRef}
        className="relative h-full flex-none"
        style={isMobile ? { touchAction: "pan-x pan-y" } : undefined}
      >
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
            onOpenChange={(open) => setIsAiPaneOpen(open)}
          />
        )}
      </div>

      {/* Left TOC drawer (desktop only; mobile uses full-screen takeover above) */}
      {isTocOpen && !isMobile && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            aria-hidden
            onClick={() => setIsTocOpen(false)}
          />
          <aside
            className="fixed left-0 bottom-0 z-50 w-72 sm:w-80 bg-background text-foreground border-r border-border shadow-lg flex flex-col animate-in slide-in-from-left duration-200"
            style={{ top: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}
            role="dialog"
            aria-label="Table of contents"
          >
            <div className="grid grid-cols-3 items-center px-4 py-3 border-b border-border shrink-0">
              <div />
              <div className="flex justify-center">
                <div className="inline-flex rounded-lg border border-border p-0.5" role="group">
                  <button
                    type="button"
                    onClick={() => setTocDrawerMode("pages")}
                    aria-label="Page thumbnails"
                    className={`rounded-md p-1.5 transition-colors ${
                      tocDrawerMode === "pages"
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  {initialBookmarks !== undefined && (
                    <button
                      type="button"
                      onClick={() => setTocDrawerMode("bookmarks")}
                      aria-label="Bookmarks"
                      className={`rounded-md p-1.5 transition-colors ${
                        tocDrawerMode === "bookmarks"
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Bookmark className="h-4 w-4" />
                    </button>
                  )}
                  {pdfOutline && pdfOutline.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTocDrawerMode("contents")}
                      aria-label="Contents"
                      className={`rounded-md p-1.5 transition-colors ${
                        tocDrawerMode === "contents"
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <List className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsTocOpen(false)}
                  aria-label="Close"
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {tocDrawerMode === "contents" ? (
                pdfOutline && pdfOutline.length > 0 && pdfDoc ? (
                  <div className="p-4">
                    <PdfTocList
                      items={pdfOutline}
                      pdfDoc={pdfDoc}
                      onSelectPage={handleTocSelectPage}
                      depth={0}
                    />
                  </div>
                ) : (
                  <div className="p-4 text-sm text-muted-foreground">
                    No table of contents in this document.
                  </div>
                )
              ) : tocDrawerMode === "bookmarks" ? (
                bookmarks.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    No bookmarks. Use the bookmark icon to save pages.
                  </div>
                ) : pdfDoc ? (
                  <div className="p-4">
                    <PdfThumbnailList
                      pdf={pdfDoc}
                      currentPage={currentPage}
                      onSelectPage={handleTocSelectPage}
                      pageFilter={bookmarks}
                    />
                  </div>
                ) : null
              ) : pdfDoc ? (
                <div className="p-4">
                  <PdfThumbnailList
                    pdf={pdfDoc}
                    currentPage={currentPage}
                    onSelectPage={(pageNum) => {
                      goToPage(pageNum);
                      setIsTocOpen(false);
                    }}
                  />
                </div>
              ) : null}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function PdfThumbnailList({
  pdf,
  currentPage,
  onSelectPage,
  gridLayout,
  pageFilter,
}: {
  pdf: PDFDocumentProxy;
  currentPage: number;
  onSelectPage: (pageNum: number) => void;
  gridLayout?: "desktop" | "mobile";
  pageFilter?: number[];
}) {
  const isGrid = gridLayout === "mobile";
  const pages = pageFilter && pageFilter.length > 0
    ? [...pageFilter].sort((a, b) => a - b).filter((p) => p >= 1 && p <= pdf.numPages)
    : Array.from({ length: pdf.numPages }, (_, idx) => idx + 1);

  return (
    <div
      className={
        isGrid
          ? "grid grid-cols-3 [@media(orientation:landscape)]:grid-cols-4 gap-3"
          : "space-y-1.5"
      }
    >
      {pages.map((pageNum) => (
        <LazyPdfThumbnail
          key={pageNum}
          pdf={pdf}
          pageNumber={pageNum}
          isCurrentPage={currentPage === pageNum}
          onSelect={() => onSelectPage(pageNum)}
          gridLayout={gridLayout}
        />
      ))}
    </div>
  );
}

function LazyPdfThumbnail({
  pdf,
  pageNumber,
  isCurrentPage,
  onSelect,
  gridLayout,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  isCurrentPage: boolean;
  onSelect: () => void;
  gridLayout?: "desktop" | "mobile";
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(pageNumber <= 5);

  useEffect(() => {
    if (shouldRender) return;
    const el = hostRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShouldRender(true);
          obs.disconnect();
        }
      },
      { root: null, rootMargin: "400px 0px", threshold: 0.01 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [shouldRender]);

  return (
    <div ref={hostRef}>
      {shouldRender ? (
        <PdfThumbnail
          pdf={pdf}
          pageNumber={pageNumber}
          isCurrentPage={isCurrentPage}
          onSelect={onSelect}
          gridLayout={gridLayout}
        />
      ) : (
        <div className="w-full rounded border border-border bg-muted/30" style={{ aspectRatio: "1 / 1.4142" }} />
      )}
    </div>
  );
}

function PdfThumbnail({
  pdf,
  pageNumber,
  isCurrentPage,
  onSelect,
  gridLayout,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  isCurrentPage: boolean;
  onSelect: () => void;
  gridLayout?: "desktop" | "mobile";
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel?: () => void; promise: Promise<unknown> } | null = null;

    const render = async () => {
      const { PixelsPerInch } = await import("pdfjs-dist");
      const page = await pdf.getPage(pageNumber);
      if (cancelled || !canvasRef.current) return;

      const viewport = page.getViewport({
        scale: 0.25 * PixelsPerInch.PDF_TO_CSS_UNITS,
      });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;

      renderTask = page.render({
        canvasContext: context,
        viewport,
        canvas,
      });
      await renderTask.promise;
    };

    render().catch(() => {});
    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [pdf, pageNumber]);

  const isGrid = gridLayout === "mobile";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full block text-left rounded border transition-colors hover:border-primary/50 hover:bg-accent/50 ${
        !isGrid ? "max-w-[95px] mx-auto" : ""
      } ${
        isCurrentPage ? "border-primary ring-2 ring-primary/30 bg-accent/30" : "border-border"
      }`}
    >
      <canvas ref={canvasRef} className="w-full h-auto block rounded-t" />
      <div
        className={`py-1 text-center text-muted-foreground ${gridLayout === "mobile" ? "text-sm" : "text-xs"}`}
      >
        {pageNumber}
      </div>
    </button>
  );
}

interface PdfPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale?: number;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  isMobile?: boolean;
  mobilePagedMode?: boolean;
  itemTextsCacheRef?: RefObject<Map<number, string[]>>;
}

function LazyPdfPage({
  pdf,
  pageNumber,
  scale = 1,
  scrollContainerRef,
  isMobile,
  mobilePagedMode,
  itemTextsCacheRef,
}: PdfPageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(pageNumber <= 2);

  useEffect(() => {
    const el = hostRef.current;
    const root = scrollContainerRef?.current ?? null;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const isIntersecting = Boolean(entry?.isIntersecting);
        if (isMobile || scale > 1) {
          // iOS can rapidly toggle intersection near viewport boundaries while scrolling.
          // While zoomed in, also keep desktop pages mounted once rendered to avoid
          // mount/unmount churn that causes repeated renders and anchor instability.
          if (isIntersecting) setShouldRender(true);
          return;
        }
        setShouldRender(isIntersecting);
      },
      // Keep a wide buffer so nearby pages stay warm, but far pages unmount.
      { root, rootMargin: mobilePagedMode ? "0px 1400px" : "1400px 0px", threshold: 0 },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [scrollContainerRef, isMobile, mobilePagedMode, scale]);

  return (
    <div
      ref={hostRef}
      className={mobilePagedMode ? "w-full h-full shrink-0 snap-start flex items-center justify-center" : undefined}
    >
      {shouldRender ? (
        <PdfPage
          pdf={pdf}
          pageNumber={pageNumber}
          scale={scale}
          scrollContainerRef={scrollContainerRef}
          isMobile={isMobile}
          mobilePagedMode={mobilePagedMode}
          itemTextsCacheRef={itemTextsCacheRef}
        />
      ) : (
        <div className="w-full flex justify-center">
          <div
            className={`page relative shadow-sm border bg-white ${isMobile ? "max-w-[896px]" : "w-full max-w-4xl"}`}
            style={isMobile ? { width: `calc(100% - ${MOBILE_PAGE_SIDE_MARGIN_PX * 2}px)` } : undefined}
          >
            <div className="w-full" style={{ aspectRatio: "1 / 1.4142" }} />
          </div>
        </div>
      )}
    </div>
  );
}

function PdfPage({
  pdf,
  pageNumber,
  scale = 1,
  scrollContainerRef,
  isMobile,
  mobilePagedMode,
  itemTextsCacheRef,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerHostRef = useRef<HTMLDivElement | null>(null);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel?: () => void; promise: Promise<unknown> } | null = null;
    let textLayerBuilder: {
      cancel?: () => void;
      render?: (opts: { viewport: unknown }) => Promise<unknown>;
    } | null = null;

    const render = async () => {
      const debug = isPdfDebugEnabled();
      const renderStart = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (debug) {
        console.log("[PdfDebug] page:render:start", {
          pageNumber,
          scale,
          isMobile,
        });
      }
      const { PixelsPerInch, setLayerDimensions } = await import("pdfjs-dist");
      const page = await pdf.getPage(pageNumber);
      let itemTexts = itemTextsCacheRef?.current?.get(pageNumber);
      if (!itemTexts) {
        const textContent = await page.getTextContent();
        itemTexts = (textContent.items as Array<{ str?: string }>).map((item) => item?.str ?? "");
        itemTextsCacheRef?.current?.set(pageNumber, itemTexts);
      }
      if (
        cancelled ||
        !canvasRef.current ||
        !textLayerHostRef.current ||
        !pageContainerRef.current
      ) {
        return;
      }

      const scrollViewportWidth = scrollContainerRef?.current?.clientWidth ?? 0;
      const scrollViewportHeight = scrollContainerRef?.current?.clientHeight ?? 0;
      const mobileTargetWidth = Math.max(
        0,
        scrollViewportWidth - MOBILE_PAGE_SIDE_MARGIN_PX * 2 - MOBILE_FIT_WIDTH_BUFFER_PX * 2,
      );
      const baseViewport = page.getViewport({ scale: PixelsPerInch.PDF_TO_CSS_UNITS });
      const pageAspect = baseViewport.height / Math.max(1, baseViewport.width);
      const mobileHeightLimitedWidth =
        isMobile && scrollViewportHeight > 0
          ? Math.max(0, (scrollViewportHeight - MOBILE_PAGE_SIDE_MARGIN_PX * 2) / Math.max(0.1, pageAspect))
          : 0;
      const mobileFittedWidth =
        isMobile && mobileTargetWidth > 0
          ? mobileHeightLimitedWidth > 0
            ? Math.min(mobileTargetWidth, mobileHeightLimitedWidth)
            : mobileTargetWidth
          : 0;
      const rawWidth = isMobile && mobileFittedWidth > 0
        ? mobileFittedWidth
        : isMobile && mobileTargetWidth > 0
          ? mobileTargetWidth
          : (pageContainerRef.current.parentElement?.clientWidth ?? 0);
      const containerWidth = Math.min(rawWidth || 896, 896);
      const fitFactorMin = isMobile ? 0.1 : 0.5;
      const fitFactor = containerWidth
        ? clamp(containerWidth / baseViewport.width, fitFactorMin, 2.5)
        : 1;

      const viewport = page.getViewport({
        scale: scale * fitFactor * PixelsPerInch.PDF_TO_CSS_UNITS,
      });
      const outputScale = window.devicePixelRatio || 1;

      const pageContainer = pageContainerRef.current;
      pageContainer.style.setProperty("--scale-factor", viewport.scale.toString());
      // Keep mobile sizing deterministic; desktop can use PDF.js layer sizing.
      if (isMobile) {
        pageContainer.style.width = `${viewport.width}px`;
        pageContainer.style.height = `${viewport.height}px`;
      } else {
        setLayerDimensions(pageContainer, viewport);
      }

      const canvas = canvasRef.current;
      const renderCanvas = document.createElement("canvas");
      const renderContext = renderCanvas.getContext("2d");
      if (!renderContext) return;

      renderCanvas.width = Math.floor(viewport.width * outputScale);
      renderCanvas.height = Math.floor(viewport.height * outputScale);

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
      renderTask = page.render({
        canvas: renderCanvas,
        canvasContext: renderContext,
        viewport,
        transform,
      });
      await renderTask.promise;
      if (cancelled || !canvasRef.current) return;

      // Draw into an offscreen canvas first, then swap in one step to avoid blank-frame flicker.
      canvas.width = renderCanvas.width;
      canvas.height = renderCanvas.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(renderCanvas, 0, 0);

      const { TextLayerBuilder } = await import("pdfjs-dist/web/pdf_viewer.mjs");
      if (cancelled) return;

      const textLayerHost = textLayerHostRef.current;
      textLayerHost.innerHTML = "";
      textLayerHost.style.setProperty("--scale-factor", viewport.scale.toString());
      setLayerDimensions(textLayerHost, viewport);

      textLayerBuilder = new TextLayerBuilder({
        pdfPage: page,
        onAppend: (div: HTMLDivElement) => {
          // Only index leaf text spans (exclude structural wrapper spans) so
          // position itemIndex stays aligned with actual text runs.
          const walker = document.createTreeWalker(div, NodeFilter.SHOW_ELEMENT, {
            acceptNode: (node) => {
              if (!(node instanceof HTMLSpanElement)) return NodeFilter.FILTER_SKIP;
              if (node.querySelector("span")) return NodeFilter.FILTER_SKIP;
              if ((node.textContent ?? "").length === 0) return NodeFilter.FILTER_SKIP;
              return NodeFilter.FILTER_ACCEPT;
            },
          });

          const textNodes: HTMLSpanElement[] = [];
          let current = walker.nextNode();
          while (current) {
            textNodes.push(current as HTMLSpanElement);
            current = walker.nextNode();
          }

          let itemIndex = 0;
          let itemCharOffset = 0;

          const advanceToNextNonEmptyItem = () => {
            while (itemIndex < itemTexts.length && (itemTexts[itemIndex]?.length ?? 0) === 0) {
              itemIndex += 1;
              itemCharOffset = 0;
            }
          };

          advanceToNextNonEmptyItem();

          textNodes.forEach((node) => {
            const safeIndex = Math.min(itemIndex, Math.max(0, itemTexts.length - 1));
            node.dataset.itemIndex = safeIndex.toString();
            node.dataset.pageNumber = pageNumber.toString();

            // Consume this span's visible text against textContent item strings so
            // subsequent spans keep the correct underlying item index.
            let remaining = (node.textContent ?? "").length;
            while (remaining > 0 && itemIndex < itemTexts.length) {
              const currentItem = itemTexts[itemIndex] ?? "";
              const remainingInItem = Math.max(0, currentItem.length - itemCharOffset);
              if (remainingInItem === 0) {
                itemIndex += 1;
                itemCharOffset = 0;
                advanceToNextNonEmptyItem();
                continue;
              }
              const take = Math.min(remaining, remainingInItem);
              remaining -= take;
              itemCharOffset += take;
              if (itemCharOffset >= currentItem.length) {
                itemIndex += 1;
                itemCharOffset = 0;
                advanceToNextNonEmptyItem();
              }
            }
          });
          textLayerHost.appendChild(div);
        },
      }) as unknown as { cancel?: () => void; render?: (opts: { viewport: unknown }) => Promise<unknown> };

      await textLayerBuilder?.render?.({ viewport });
      if (debug) {
        const renderEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
        console.log("[PdfDebug] page:render:done", {
          pageNumber,
          scale,
          isMobile,
          viewportWidth: viewport.width,
          viewportHeight: viewport.height,
          durationMs: Math.round(renderEnd - renderStart),
        });
      }
    };

    render().catch(() => {});

    return () => {
      cancelled = true;
      if (renderTask?.cancel) renderTask.cancel();
      textLayerBuilder?.cancel?.();
    };
  }, [pdf, pageNumber, scale, isMobile, scrollContainerRef, itemTextsCacheRef]);

  return (
    <div className={mobilePagedMode ? "w-full h-full flex items-center justify-center" : "w-full flex justify-center"}>
      <div
        ref={pageContainerRef}
        className={`page relative bg-white ${isMobile ? "max-w-[896px]" : ""}`}
        style={
          isMobile
            ? {
                width: `calc(100% - ${MOBILE_PAGE_SIDE_MARGIN_PX * 2}px)`,
                margin: "0 auto",
                border: 0,
                boxSizing: "border-box",
              }
            : undefined
        }
      >
        <div className="canvasWrapper">
          <canvas ref={canvasRef} className="pointer-events-none block" />
        </div>
        <div ref={textLayerHostRef} className="absolute inset-0" />
      </div>
    </div>
  );
}

function PdfTocList({
  items,
  pdfDoc,
  onSelectPage,
  depth,
  mobile,
}: {
  items: Array<{ title: string; dest?: unknown; items?: unknown[] }>;
  pdfDoc: PDFDocumentProxy;
  onSelectPage: (pageNum: number) => void;
  depth: number;
  mobile?: boolean;
}) {
  const textSize = mobile ? "text-base" : "text-sm";
  return (
    <ul className="list-none space-y-0.5">
      {items.map((item, idx) => {
        const hasDest = item.dest != null;
        const children = item.items;
        return (
          <li key={idx}>
            {hasDest ? (
              <button
                type="button"
                className={`w-full text-left py-1.5 px-2 rounded-md text-foreground hover:bg-accent hover:text-accent-foreground ${textSize} transition-colors`}
                style={{ paddingLeft: 8 + depth * 12 }}
                onClick={async () => {
                  try {
                    let pageNum: number | null = null;
                    if (typeof item.dest === "string") {
                      const destArray = await pdfDoc.getDestination(item.dest);
                      if (destArray && Array.isArray(destArray) && destArray[0] != null) {
                        const first = destArray[0];
                        if (typeof first === "number") {
                          pageNum = first + 1; // 0-based index to 1-based page
                        } else if (typeof first === "object" && "num" in first) {
                          const pageIndex = await pdfDoc.getPageIndex(first as { num: number; gen: number });
                          pageNum = pageIndex >= 0 ? pageIndex + 1 : null;
                        }
                      }
                    } else if (Array.isArray(item.dest) && item.dest[0] != null) {
                      const first = item.dest[0];
                      if (typeof first === "number") {
                        pageNum = first + 1;
                      } else if (typeof first === "object" && "num" in first) {
                        const pageIndex = await pdfDoc.getPageIndex(first as { num: number; gen: number });
                        pageNum = pageIndex >= 0 ? pageIndex + 1 : null;
                      }
                    }
                    if (pageNum != null) {
                      onSelectPage(pageNum);
                    }
                  } catch {
                    // Ignore invalid destinations
                  }
                }}
              >
                {item.title || "(Untitled)"}
              </button>
            ) : (
              <span
                className={`block py-1.5 px-2 ${textSize} text-muted-foreground`}
                style={{ paddingLeft: 8 + depth * 12 }}
              >
                {item.title || "(Untitled)"}
              </span>
            )}
            {children && Array.isArray(children) && children.length > 0 && (
              <PdfTocList
                items={children as Array<{ title: string; dest?: unknown; items?: unknown[] }>}
                pdfDoc={pdfDoc}
                onSelectPage={onSelectPage}
                depth={depth + 1}
                mobile={mobile}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
