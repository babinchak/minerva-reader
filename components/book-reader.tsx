"use client";

import {
  StatefulReader,
  StatefulPreferencesProvider,
  ThStoreProvider,
  ThI18nProvider,
  setTheme,
  setScroll,
  setColumnCount,
  useAppDispatch,
  useAppSelector,
  usePreferences,
  useEpubNavigator,
} from "@edrlab/thorium-web/epub";
import { Link, type Locator } from "@readium/shared";
import {
  createPreferences,
  defaultPreferences,
  ThThemeKeys,
  ThSettingsKeys,
  ThActionsKeys,
  type ThemeTokens,
} from "@edrlab/thorium-web/core/preferences";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EpubReaderToolbar } from "@/components/epub-reader-toolbar";
import { useTheme } from "next-themes";
import { AIAssistant } from "@/components/ai-assistant";
import { useParams, useSearchParams } from "next/navigation";
import { useSelectedText } from "@/lib/use-selected-text";
import { useIsMobile } from "@/lib/use-media-query";
import { hapticLight } from "@/lib/haptic";
import { PortraitLockOverlay } from "@/components/portrait-lock-overlay";
import { getLiveSelectedText, getTextSelection } from "@/lib/book-position-utils";
import { getThoriumThemeFromStoredVariants } from "@/lib/theme-variants";
import { ReadPageSkeleton } from "@/components/read-page-skeleton";
import { ReadingAnchorPill } from "@/components/reading-anchor-pill";
import { MinervaLogo } from "@/components/minerva-logo";

/** Fallback when document theme can't be read (SSR, etc.) */
const FALLBACK_LIGHT = {
  background: "hsl(35, 25%, 97%)",
  text: "hsl(25, 10%, 12%)",
  link: "#0000ee",
  visited: "#551a8b",
  subdue: "#808080",
  disable: "#808080",
  hover: "hsl(35, 18%, 90%)",
  onHover: "hsl(25, 10%, 12%)",
  select: "#b4d8fe",
  onSelect: "inherit" as const,
  focus: "#0067f4",
  elevate: "0px 0px 2px #808080",
  immerse: "0.6",
};
const FALLBACK_DARK = {
  background: "hsl(25, 15%, 8%)",
  text: "hsl(40, 15%, 95%)",
  link: "#63caff",
  visited: "#0099e5",
  subdue: "#808080",
  disable: "#808080",
  hover: "hsl(25, 12%, 18%)",
  onHover: "hsl(40, 15%, 95%)",
  select: "#b4d8fe",
  onSelect: "inherit" as const,
  focus: "#0067f4",
  elevate: "0px 0px 2px #808080",
  immerse: "0.4",
};

const DESKTOP_SETTINGS_REFLOW_ORDER = defaultPreferences.settings.reflowOrder.filter(
  (k) => k !== ThSettingsKeys.theme && k !== ThSettingsKeys.columns
);
const MOBILE_SETTINGS_REFLOW_ORDER = DESKTOP_SETTINGS_REFLOW_ORDER.filter(
  (k) => k !== ThSettingsKeys.layout
);

/** Preferences with Themes panel hidden, Jump to position removed, mobile layout removed. */
function createThoriumPreferences(isMobile: boolean) {
  const mobilePaginatedAffordance: typeof defaultPreferences.affordances.paginated = isMobile
    ? ({
        reflow: {
          default: {
            variant: "none" as const,
            discard: "none" as const,
            hint: "none" as const,
          },
          breakpoints: {
            large: { variant: "none" as const },
            xLarge: { variant: "none" as const },
          },
        },
        fxl: {
          default: {
            variant: "none" as const,
            discard: "none" as const,
            hint: "none" as const,
          },
        },
      } as unknown as typeof defaultPreferences.affordances.paginated)
    : defaultPreferences.affordances.paginated;

  return createPreferences({
    ...defaultPreferences,
    settings: {
      ...defaultPreferences.settings,
      reflowOrder: isMobile ? MOBILE_SETTINGS_REFLOW_ORDER : DESKTOP_SETTINGS_REFLOW_ORDER,
      fxlOrder: defaultPreferences.settings.fxlOrder.filter((k) => k !== ThSettingsKeys.theme && k !== ThSettingsKeys.columns),
    },
    actions: {
      ...defaultPreferences.actions,
      reflowOrder: defaultPreferences.actions.reflowOrder.filter(
        (k) => k !== ThActionsKeys.jumpToPosition && k !== ThActionsKeys.fullscreen
      ),
      fxlOrder: defaultPreferences.actions.fxlOrder.filter(
        (k) => k !== ThActionsKeys.jumpToPosition && k !== ThActionsKeys.fullscreen
      ),
    },
    theming: {
      ...defaultPreferences.theming,
      themes: {
        ...defaultPreferences.theming.themes,
        reflowOrder: ["auto", ThThemeKeys.light, ThThemeKeys.dark],
        fxlOrder: ["auto", ThThemeKeys.light, ThThemeKeys.dark],
        systemThemes: { light: ThThemeKeys.light, dark: ThThemeKeys.dark },
        keys: {
          ...defaultPreferences.theming.themes.keys,
          [ThThemeKeys.light]: FALLBACK_LIGHT,
          [ThThemeKeys.dark]: FALLBACK_DARK,
        },
      },
    },
    affordances: {
      ...defaultPreferences.affordances,
      paginated: mobilePaginatedAffordance,
    },
    metadata: {
      ...defaultPreferences.metadata,
      documentTitle: { format: "none" },
    },
  });
}

const EPUB_STORAGE_KEY_SUFFIX = "-current-location";

interface BookReaderProps {
  rawManifest: { readingOrder?: Array<{ href?: string }> };
  selfHref: string;
  bookTitle?: string;
  initialReadingPosition?: Record<string, unknown> | null;
  isLoggedIn?: boolean;
  demoMode?: boolean;
  demoEntries?: import("@/lib/demo-chat-data").DemoChatEntry[];
}

export function BookReader({ rawManifest, selfHref, bookTitle, initialReadingPosition, isLoggedIn = false, demoMode, demoEntries }: BookReaderProps) {
  const [mounted, setMounted] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const isMobile = useIsMobile();
  const selectedText = useSelectedText();
  const params = useParams();
  const searchParams = useSearchParams();
  const bookId = params?.bookId as string;
  const refChatId = searchParams.get("refChatId") || null;
  const refQuote = searchParams.get("refQuote") || null;
  const thoriumPreferences = useMemo(() => createThoriumPreferences(isMobile), [isMobile]);

  useEffect(() => {
    if (bookTitle) document.title = bookTitle;
    return () => { document.title = "Minerva Reader"; };
  }, [bookTitle]);

  const aiNonceRef = useRef(0);
  const [aiRequest, setAiRequest] = useState<{ nonce: number; action: "page" | "selection" } | null>(null);
  const openAiNonceRef = useRef(0);
  const [openAiRequest, setOpenAiRequest] = useState<{ nonce: number } | null>(null);
  const [isAiPaneOpen, setIsAiPaneOpen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [mobileDrawerAnchor, setMobileDrawerAnchor] = useState<"top" | "bottom">("bottom");
  const epubNavNonceRef = useRef(0);
  const [epubNavRef, setEpubNavRef] = useState<{ readingOrderIndex: number; quotedText?: string } | null>(null);

  // --- EPUB content loading overlay ---
  const [readerLoaded, setReaderLoaded] = useState(false);

  // --- Thorium panel open (TOC / settings) — hides mobile toolbar overlay ---
  const [thoriumPanelOpen, setThoriumPanelOpen] = useState(false);

  // --- Reading anchor (return-to-reading after ref navigation) ---
  const [readingAnchor, setReadingAnchor] = useState(false);
  // Refs populated by EpubReadingAnchor (inside Thorium context) so BookReader can trigger save/restore
  const saveAnchorRef = useRef<() => boolean>(() => false);
  const restoreAnchorRef = useRef<() => void>(() => {});

  const handleNavigateToRef = useCallback((ref: { page?: number; readingOrderIndex?: number; quotedText?: string }) => {
    if (typeof ref.readingOrderIndex === "number") {
      // Save reading anchor before first ref jump
      if (!readingAnchor) {
        const saved = saveAnchorRef.current();
        if (saved) setReadingAnchor(true);
      }

      epubNavNonceRef.current += 1;
      // Create a new object each time to ensure useEffect triggers even for the same reading order index
      setEpubNavRef({ readingOrderIndex: ref.readingOrderIndex, quotedText: ref.quotedText });
    }
  }, [readingAnchor]);

  // Handle ?refSection=...&refQuote=... URL params (e.g. from "open in new tab")
  const refParamsHandledRef = useRef(false);
  useEffect(() => {
    if (refParamsHandledRef.current) return;
    const refSection = searchParams.get("refSection");
    const refQuote = searchParams.get("refQuote");
    if (!refSection) return;
    refParamsHandledRef.current = true;

    (async () => {
      try {
        const res = await fetch(`/api/books/${bookId}/sections?sectionId=${encodeURIComponent(refSection)}`);
        if (!res.ok) return;
        const data = await res.json();
        const startPosition = data.startPosition as string;
        if (!startPosition) return;

        const parts = startPosition.split("/");
        let readingOrderIndex = parseInt(parts[0], 10);
        if (Number.isNaN(readingOrderIndex)) return;

        const quotedText = refQuote
          ?.replace(/^[""\u201C\u201D]+/, "")
          .replace(/[""\u201C\u201D]+$/, "")
          .trim();

        // Use xhtml_breaks to resolve the correct XHTML file when the
        // section spans multiple reading order entries.
        const xhtmlBreaks = data.xhtmlBreaks as number[] | null;
        if (xhtmlBreaks?.length && quotedText && data.contentText) {
          const { resolveQuoteReadingOrder } = await import("@/lib/resolve-quote-page");
          readingOrderIndex = resolveQuoteReadingOrder(
            { startPosition, pageBreaks: data.pageBreaks ?? null, xhtmlBreaks, contentText: data.contentText },
            readingOrderIndex,
            quotedText
          );
        }

        // Wait for the epub to actually render before navigating.
        // Poll for the Thorium iframe to exist, then trigger navigation.
        let attempt = 0;
        const maxAttempts = 40; // ~6 seconds total
        const waitForEpub = () => {
          attempt++;
          const iframes = document.querySelectorAll("iframe.readium-navigator-iframe");
          if (iframes.length > 0) {
            setEpubNavRef({ readingOrderIndex, quotedText: quotedText || undefined });
            return;
          }
          if (attempt < maxAttempts) {
            setTimeout(waitForEpub, 150);
          } else {
            // Last resort: navigate anyway, EpubRefNavigator will handle its own polling
            setEpubNavRef({ readingOrderIndex, quotedText: quotedText || undefined });
          }
        };
        waitForEpub();
      } catch {
        // Section lookup failed — ignore
      }
    })();
  }, [searchParams, bookId, setEpubNavRef]);

  const toggleChrome = useCallback(() => {
    hapticLight();
    setChromeVisible((v) => !v);
  }, []);
  const tapRef = useRef<{ pointerId: number; x: number; y: number; t: number; moved: boolean; hadSelection: boolean } | null>(
    null
  );
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    setChromeVisible(!isMobile);
  }, [isMobile]);

  const selectionExists = Boolean(selectedText && selectedText.trim().length > 0);
  useEffect(() => {
    if (isMobile && !chromeVisible && selectionExists) {
      setChromeVisible(true);
    }
  }, [isMobile, chromeVisible, selectionExists]);
  const mobileTopToolbarVisible = chromeVisible && !selectionExists && !thoriumPanelOpen;

  useEffect(() => {
    if (!isMobile) {
      setMobileDrawerAnchor("bottom");
      return;
    }
    if (!selectionExists) {
      setMobileDrawerAnchor("bottom");
      return;
    }

    const watchedDocs = new Set<Document>();
    const iframeLoadHandlers = new Map<HTMLIFrameElement, () => void>();
    const updateAnchor = () => {
      const rect = getSelectionViewportRect();
      if (!rect) return;
      const centerY = rect.top + rect.height / 2;
      setMobileDrawerAnchor(centerY > window.innerHeight * 0.58 ? "top" : "bottom");
    };

    const attachSelectionListener = (targetDoc: Document | null | undefined) => {
      if (!targetDoc || watchedDocs.has(targetDoc)) return;
      targetDoc.addEventListener("selectionchange", updateAnchor);
      watchedDocs.add(targetDoc);
    };

    const attachIframeSelectionListener = (iframe: HTMLIFrameElement) => {
      if (iframeLoadHandlers.has(iframe)) return;
      const handleIframeLoad = () => {
        try {
          attachSelectionListener(iframe.contentDocument ?? iframe.contentWindow?.document);
          updateAnchor();
        } catch {
          // Ignore inaccessible iframe document.
        }
      };
      iframe.addEventListener("load", handleIframeLoad);
      iframeLoadHandlers.set(iframe, handleIframeLoad);
      handleIframeLoad();
    };

    const syncIframeSelectionListeners = () => {
      const iframes = document.querySelectorAll("iframe.readium-navigator-iframe");
      for (const iframe of iframes) {
        if (iframe instanceof HTMLIFrameElement) attachIframeSelectionListener(iframe);
      }
    };

    attachSelectionListener(document);
    syncIframeSelectionListeners();
    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    const observer = new MutationObserver(() => {
      syncIframeSelectionListeners();
      updateAnchor();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateAnchor);
      watchedDocs.forEach((targetDoc) => {
        targetDoc.removeEventListener("selectionchange", updateAnchor);
      });
      iframeLoadHandlers.forEach((handler, iframe) => {
        iframe.removeEventListener("load", handler);
      });
    };
  }, [isMobile, selectionExists]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Pre-populate localStorage with saved position before Thorium reads it
  useLayoutEffect(() => {
    if (initialReadingPosition && typeof window !== "undefined") {
      try {
        const key = `${selfHref}${EPUB_STORAGE_KEY_SUFFIX}`;
        localStorage.setItem(key, JSON.stringify(initialReadingPosition));
      } catch {
        // Ignore localStorage errors
      }
    }
    setStorageReady(true);
  }, [selfHref, initialReadingPosition]);

  // Detect when EPUB iframe content has actually loaded
  useEffect(() => {
    if (!mounted || !storageReady) return;
    if (readerLoaded) return;

    const checkIframeLoaded = () => {
      const iframe = document.querySelector("iframe.readium-navigator-iframe") as HTMLIFrameElement | null;
      if (iframe?.contentDocument?.body?.innerHTML) {
        setReaderLoaded(true);
        return true;
      }
      return false;
    };

    // Already loaded (fast cache hit)
    if (checkIframeLoaded()) return;

    // Poll for iframe appearing and loading content
    const interval = setInterval(checkIframeLoaded, 150);

    // Also watch for iframe being added to the DOM
    const observer = new MutationObserver(() => {
      if (checkIframeLoaded()) {
        clearInterval(interval);
        observer.disconnect();
      }
    });
    const root = document.querySelector(".epub-reader-with-custom-toolbar") ?? document.body;
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, [mounted, storageReady, readerLoaded]);

  if (!mounted || !storageReady) {
    return <ReadPageSkeleton />;
  }

  return (
    <ThStoreProvider>
      <PortraitLockOverlay />
      <StatefulPreferencesProvider
        key={isMobile ? "mobile" : "desktop"}
        initialPreferences={thoriumPreferences}
      >
        <ThI18nProvider>
          <ThoriumThemeSync />
          <EpubPanelOpenWatcher onChange={setThoriumPanelOpen} />
          <EpubMobileLayoutForce />
          <EpubMobileIframeHeightFix enabled={isMobile} />
          <EpubSelectionTouchGuard enabled={isMobile} />
          <EpubMobileCenterTapToggle enabled={isMobile} onToggle={toggleChrome} />
          <div
            className={`epub-reader-with-custom-toolbar w-full flex flex-col box-border ${isMobile ? "h-svh" : "h-screen"}`}
            style={isMobile ? { paddingBottom: "env(safe-area-inset-bottom, 0px)" } : undefined}
          >
            {isMobile ? (
              <div className="relative flex-1 min-h-0 flex flex-col">
                {/* Mobile: toolbar overlays (no layout shift, avoids text reflow) */}
                <div
                  className={[
                    "absolute left-0 right-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur transition-opacity duration-200",
                    mobileTopToolbarVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
                  ].join(" ")}
                  style={{
                    top: 0,
                    paddingTop: "env(safe-area-inset-top, 0px)",
                    touchAction: "pan-x pan-y",
                  }}
                  aria-hidden={!mobileTopToolbarVisible}
                >
                  <EpubReaderToolbar
                    onRequestAiRun={(action) => {
                      aiNonceRef.current += 1;
                      setAiRequest({ nonce: aiNonceRef.current, action });
                    }}
                    onRequestAiOpen={() => {
                      openAiNonceRef.current += 1;
                      setOpenAiRequest({ nonce: openAiNonceRef.current });
                    }}
                    isAiPaneOpen={isAiPaneOpen}
                  />
                </div>
                {readingAnchor && (
                  <ReadingAnchorPill
                    label="previous position"
                    visible={chromeVisible}
                    autoHideMs={5000}
                    topOffset={56}
                    onReturn={() => {
                      restoreAnchorRef.current();
                      setReadingAnchor(false);
                    }}
                    onDismiss={() => setReadingAnchor(false)}
                  />
                )}
                <div
                  className="flex flex-1 relative min-h-0 min-w-0"
                  style={{ touchAction: "pan-x pan-y" }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    tapRef.current = {
                      pointerId: e.pointerId,
                      x: e.clientX,
                      y: e.clientY,
                      t: Date.now(),
                      moved: false,
                      hadSelection: getLiveSelectedText().length > 0,
                    };
                    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                  }}
                  onPointerMove={(e) => {
                    const t = tapRef.current;
                    if (!t || t.pointerId !== e.pointerId) return;
                    if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) t.moved = true;
                  }}
                  onPointerUp={(e) => {
                    pointersRef.current.delete(e.pointerId);
                    const t = tapRef.current;
                    tapRef.current = null;
                    if (!t || t.pointerId !== e.pointerId) return;
                    if (t.hadSelection || getLiveSelectedText().length > 0) return;
                    const dt = Date.now() - t.t;
                    if (t.moved || dt > 350) return;
                    const target = e.target as HTMLElement | null;
                    if (target?.closest("button,a,input,textarea,select,[role='button'],[role='menuitem'],[role='menu'],[data-radix-collection-item]")) return;
                    const w = window.innerWidth;
                    const third = w / 3;
                    const x = e.clientX;
                    if (x >= third && x <= third * 2) {
                      toggleChrome();
                    }
                  }}
                  onPointerCancel={() => {
                    tapRef.current = null;
                    pointersRef.current.clear();
                  }}
                >
                  <div className="flex-1 min-w-0 h-full relative bg-background">
                    <StatefulReader rawManifest={rawManifest} selfHref={selfHref} />
                    {!readerLoaded && <EpubLoadingOverlay />}
                  </div>
                  <AIAssistant
                    selectedText={selectedText}
                    bookId={bookId}
                    rawManifest={rawManifest}
                    bookType="epub"
                    mobileDrawerMinMode="quick"
                    mobileDrawerAnchor={mobileDrawerAnchor}
                    hidden={!chromeVisible || thoriumPanelOpen}
                    requestRun={aiRequest}
                    requestOpen={openAiRequest}
                    onOpenChange={setIsAiPaneOpen}
                    onNavigateToRef={handleNavigateToRef}
                    onMobileNavRefToggleChrome={toggleChrome}
                    initialChatId={refChatId}
                    initialRefQuote={refQuote}
                    demoMode={demoMode}
                    demoEntries={demoEntries}
                  />
                </div>
              </div>
            ) : (
              <>
                <EpubReaderToolbar
                  onRequestAiRun={(action) => {
                    aiNonceRef.current += 1;
                    setAiRequest({ nonce: aiNonceRef.current, action });
                  }}
                  onRequestAiOpen={() => {
                    openAiNonceRef.current += 1;
                    setOpenAiRequest({ nonce: openAiNonceRef.current });
                  }}
                  isAiPaneOpen={isAiPaneOpen}
                />
                <div className="flex flex-1 relative min-h-0 min-w-0">
                  <div className="flex-1 min-w-0 h-full relative">
                    <StatefulReader rawManifest={rawManifest} selfHref={selfHref} />
                    {!readerLoaded && <EpubLoadingOverlay />}
                    {readingAnchor && (
                      <ReadingAnchorPill
                        label="previous position"
                        visible
                        topOffset={8}
                        onReturn={() => {
                          restoreAnchorRef.current();
                          setReadingAnchor(false);
                        }}
                        onDismiss={() => setReadingAnchor(false)}
                      />
                    )}
                  </div>
                  <AIAssistant
                    selectedText={selectedText}
                    bookId={bookId}
                    rawManifest={rawManifest}
                    bookType="epub"
                    requestRun={aiRequest}
                    requestOpen={openAiRequest}
                    onOpenChange={setIsAiPaneOpen}
                    onNavigateToRef={handleNavigateToRef}
                    initialChatId={refChatId}
                    initialRefQuote={refQuote}
                    demoMode={demoMode}
                    demoEntries={demoEntries}
                  />
                </div>
              </>
            )}

            <EpubRefNavigator navRef={epubNavRef} rawManifest={rawManifest} />
            <EpubReadingAnchor saveRef={saveAnchorRef} restoreRef={restoreAnchorRef} />
            <EpubPositionSync bookId={bookId} storageKey={`${selfHref}${EPUB_STORAGE_KEY_SUFFIX}`} isLoggedIn={isLoggedIn} />
          </div>
        </ThI18nProvider>
      </StatefulPreferencesProvider>
    </ThStoreProvider>
  );
}

function findReaderIframeForDocument(targetDoc: Document): HTMLIFrameElement | null {
  const iframes = document.querySelectorAll("iframe.readium-navigator-iframe");
  for (const iframe of iframes) {
    if (!(iframe instanceof HTMLIFrameElement)) continue;
    try {
      if (iframe.contentDocument === targetDoc) return iframe;
    } catch {
      // Ignore inaccessible iframes.
    }
  }
  return null;
}

function getSelectionViewportRect(): DOMRect | null {
  try {
    const selection = getTextSelection();
    const range = selection?.range;
    const targetDoc = selection?.targetDoc;
    if (!range || !targetDoc) return null;

    const primaryRect = range.getBoundingClientRect();
    const firstRect = range.getClientRects()[0];
    const rangeRect =
      firstRect && firstRect.width > 0 && firstRect.height > 0
        ? firstRect
        : primaryRect.width > 0 || primaryRect.height > 0
          ? primaryRect
          : null;
    if (!rangeRect) return null;

    if (targetDoc === document) {
      return new DOMRect(rangeRect.left, rangeRect.top, rangeRect.width, rangeRect.height);
    }

    const readerIframe = findReaderIframeForDocument(targetDoc);
    if (!readerIframe) {
      return new DOMRect(rangeRect.left, rangeRect.top, rangeRect.width, rangeRect.height);
    }

    const frameRect = readerIframe.getBoundingClientRect();
    return new DOMRect(
      frameRect.left + rangeRect.left,
      frameRect.top + rangeRect.top,
      rangeRect.width,
      rangeRect.height
    );
  } catch {
    return null;
  }
}

function hasExpandedSelection(targetDoc: Document): boolean {
  const selection = targetDoc.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim().length > 0);
}

function EpubSelectionTouchGuard({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const watchedIframes = new Set<HTMLIFrameElement>();
    const teardownByIframe = new Map<HTMLIFrameElement, () => void>();
    const onLoadByIframe = new Map<HTMLIFrameElement, () => void>();

    const mountGuardForIframe = (iframe: HTMLIFrameElement) => {
      teardownByIframe.get(iframe)?.();
      try {
        const targetWindow = iframe.contentWindow;
        const targetDoc = iframe.contentDocument ?? targetWindow?.document;
        if (!targetWindow || !targetDoc) {
          teardownByIframe.set(iframe, () => {});
          return;
        }

        let selectionActiveUntil = 0;
        const markSelectionActivity = () => {
          if (hasExpandedSelection(targetDoc)) selectionActiveUntil = Date.now() + 1200;
        };
        const shouldSuppressSwipe = () => hasExpandedSelection(targetDoc) || Date.now() < selectionActiveUntil;

        // Track touch origin to protect long-press selection from Readium's
        // ColumnSnapper.  During a long-press the finger barely moves, but
        // even 1-2 px of natural drift triggers ColumnSnapper.onTouchMove
        // which calls deselect() and starts programmatic scrollLeft changes.
        // That shifts the document mid-gesture so the selection anchor lands
        // at a wrong (often fixed) position — sometimes on a previous page.
        // We suppress touchmove from reaching ColumnSnapper until the finger
        // moves far enough to be a genuine swipe.
        const MOVE_THRESHOLD = 10; // px — same threshold used elsewhere for tap detection
        let touchOrigin: { x: number; y: number } | null = null;
        let touchIsSwipe = false;

        const suppressTouchGesture = (event: TouchEvent) => {
          if (event.touches.length > 1) {
            touchOrigin = null;
            return;
          }

          if (event.type === "touchstart") {
            const touch = event.touches[0];
            touchOrigin = { x: touch.clientX, y: touch.clientY };
            touchIsSwipe = false;
          } else if (event.type === "touchmove" && touchOrigin && !touchIsSwipe) {
            const touch = event.touches[0];
            if (Math.hypot(touch.clientX - touchOrigin.x, touch.clientY - touchOrigin.y) > MOVE_THRESHOLD) {
              touchIsSwipe = true;
            }
          } else if (event.type === "touchend" || event.type === "touchcancel") {
            touchOrigin = null;
          }

          // Suppress when there's an active/recent selection (existing behaviour)
          // OR when this is a touchmove during a potential long-press (finger
          // hasn't moved enough to be a swipe).
          const duringPotentialLongPress =
            event.type === "touchmove" && touchOrigin && !touchIsSwipe;
          if (!shouldSuppressSwipe() && !duringPotentialLongPress) return;
          event.stopPropagation();
        };

        targetDoc.addEventListener("selectionchange", markSelectionActivity);
        targetWindow.addEventListener("touchstart", suppressTouchGesture, { capture: true, passive: true });
        targetWindow.addEventListener("touchmove", suppressTouchGesture, { capture: true, passive: true });
        targetWindow.addEventListener("touchend", suppressTouchGesture, { capture: true, passive: true });
        targetWindow.addEventListener("touchcancel", suppressTouchGesture, { capture: true, passive: true });
        markSelectionActivity();

        teardownByIframe.set(iframe, () => {
          targetDoc.removeEventListener("selectionchange", markSelectionActivity);
          targetWindow.removeEventListener("touchstart", suppressTouchGesture, true);
          targetWindow.removeEventListener("touchmove", suppressTouchGesture, true);
          targetWindow.removeEventListener("touchend", suppressTouchGesture, true);
          targetWindow.removeEventListener("touchcancel", suppressTouchGesture, true);
        });
      } catch {
        teardownByIframe.set(iframe, () => {});
      }
    };

    const attachIframe = (iframe: HTMLIFrameElement) => {
      if (watchedIframes.has(iframe)) return;
      watchedIframes.add(iframe);
      const onLoad = () => mountGuardForIframe(iframe);
      onLoadByIframe.set(iframe, onLoad);
      iframe.addEventListener("load", onLoad);
      mountGuardForIframe(iframe);
    };

    const syncIframeGuards = () => {
      const iframes = document.querySelectorAll("iframe.readium-navigator-iframe");
      for (const iframe of iframes) {
        if (iframe instanceof HTMLIFrameElement) attachIframe(iframe);
      }
    };

    syncIframeGuards();
    const observer = new MutationObserver(() => {
      syncIframeGuards();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      for (const iframe of watchedIframes) {
        const onLoad = onLoadByIframe.get(iframe);
        if (onLoad) iframe.removeEventListener("load", onLoad);
        teardownByIframe.get(iframe)?.();
      }
    };
  }, [enabled]);

  return null;
}

function isInteractiveTapTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null;
  return Boolean(element?.closest("button,a,input,textarea,select,[role='button']"));
}

function EpubMobileCenterTapToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  useEffect(() => {
    if (!enabled) return;
    const watchedIframes = new Set<HTMLIFrameElement>();
    const teardownByIframe = new Map<HTMLIFrameElement, () => void>();
    const onLoadByIframe = new Map<HTMLIFrameElement, () => void>();

    const mountTapToggleForIframe = (iframe: HTMLIFrameElement) => {
      teardownByIframe.get(iframe)?.();
      try {
        const targetWindow = iframe.contentWindow;
        const targetDoc = iframe.contentDocument ?? targetWindow?.document;
        if (!targetWindow || !targetDoc) {
          teardownByIframe.set(iframe, () => {});
          return;
        }

        let tap:
          | { pointerId: number; x: number; y: number; t: number; moved: boolean; hadSelection: boolean }
          | null = null;
        const onPointerDown = (event: PointerEvent) => {
          if (event.button !== 0) return;
          if (!event.isPrimary) return;
          tap = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            t: Date.now(),
            moved: false,
            hadSelection: hasExpandedSelection(targetDoc),
          };
        };
        const onPointerMove = (event: PointerEvent) => {
          if (!tap || tap.pointerId !== event.pointerId) return;
          if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 10) tap.moved = true;
        };
        const onPointerUp = (event: PointerEvent) => {
          const currentTap = tap;
          tap = null;
          if (!currentTap || currentTap.pointerId !== event.pointerId) return;
          if (currentTap.hadSelection || hasExpandedSelection(targetDoc)) return;
          if (isInteractiveTapTarget(event.target)) return;
          const elapsed = Date.now() - currentTap.t;
          if (currentTap.moved || elapsed > 350) return;
          const third = targetWindow.innerWidth / 3;
          if (event.clientX >= third && event.clientX <= third * 2) onToggle();
        };
        const onPointerCancel = () => {
          tap = null;
        };

        targetDoc.addEventListener("pointerdown", onPointerDown, true);
        targetDoc.addEventListener("pointermove", onPointerMove, true);
        targetDoc.addEventListener("pointerup", onPointerUp, true);
        targetDoc.addEventListener("pointercancel", onPointerCancel, true);

        teardownByIframe.set(iframe, () => {
          targetDoc.removeEventListener("pointerdown", onPointerDown, true);
          targetDoc.removeEventListener("pointermove", onPointerMove, true);
          targetDoc.removeEventListener("pointerup", onPointerUp, true);
          targetDoc.removeEventListener("pointercancel", onPointerCancel, true);
        });
      } catch {
        teardownByIframe.set(iframe, () => {});
      }
    };

    const attachIframe = (iframe: HTMLIFrameElement) => {
      if (watchedIframes.has(iframe)) return;
      watchedIframes.add(iframe);
      const onLoad = () => mountTapToggleForIframe(iframe);
      onLoadByIframe.set(iframe, onLoad);
      iframe.addEventListener("load", onLoad);
      mountTapToggleForIframe(iframe);
    };

    const syncIframeGuards = () => {
      const iframes = document.querySelectorAll("iframe.readium-navigator-iframe");
      for (const iframe of iframes) {
        if (iframe instanceof HTMLIFrameElement) attachIframe(iframe);
      }
    };

    syncIframeGuards();
    const observer = new MutationObserver(() => {
      syncIframeGuards();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      for (const iframe of watchedIframes) {
        const onLoad = onLoadByIframe.get(iframe);
        if (onLoad) iframe.removeEventListener("load", onLoad);
        teardownByIframe.get(iframe)?.();
      }
    };
  }, [enabled, onToggle]);

  return null;
}

/** Apply Readium --USER__* theme variables to EPUB iframe document(s) */
function applyThemeToEpubIframes(tokens: Record<string, string>) {
  const iframes = document.querySelectorAll("iframe.readium-navigator-iframe");
  for (const iframe of iframes) {
    if (!(iframe instanceof HTMLIFrameElement)) continue;
    try {
      const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (!doc?.documentElement) continue;
      const root = doc.documentElement.style;
      root.setProperty("--USER__backgroundColor", tokens.background ?? "");
      root.setProperty("--USER__textColor", tokens.text ?? "");
      root.setProperty("--USER__linkColor", tokens.link ?? "");
      root.setProperty("--USER__visitedColor", tokens.visited ?? "");
      root.setProperty("--USER__selectionBackgroundColor", tokens.select ?? "");
      root.setProperty("--USER__selectionTextColor", tokens.onSelect ?? "");
    } catch {
      // Cross-origin or inaccessible iframe
    }
  }
}

/** Forces paginated mode on mobile. Settings hiding happens in the initial preferences. */
function EpubMobileLayoutForce() {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) {
      dispatch(setScroll(false));
    }
  }, [isMobile, dispatch]);
  return null;
}

/**
 * On iOS Safari, CSS viewport units (100vh) inside iframes can reference the
 * top-level page viewport rather than the iframe's own dimensions.  Readium's
 * column-based pagination sets :root height to 100vh, so columns end up taller
 * than the actual iframe, clipping the bottom line of text.
 *
 * This component bypasses viewport-unit confusion entirely: it measures the
 * iframe element's real pixel height via ResizeObserver and writes it directly
 * onto the iframe document's :root as an inline style.
 */
function EpubMobileIframeHeightFix({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;

    const observers = new Map<HTMLIFrameElement, ResizeObserver>();
    const loadHandlers = new Map<HTMLIFrameElement, () => void>();

    function syncHeight(iframe: HTMLIFrameElement) {
      try {
        const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
        if (!doc?.documentElement) return;
        const h = iframe.clientHeight;
        if (h <= 0) return;
        // Subtract a bottom margin so Readium's column layout never fills to
        // the exact pixel edge.  Without this buffer the last text line can
        // straddle the column boundary and be partially clipped.  24 px ≈ one
        // line of body text — enough to guarantee clearance on any device.
        const safeH = h - 24;
        const root = doc.documentElement.style;
        root.setProperty("height", `${safeH}px`, "important");
        root.setProperty("min-height", `${safeH}px`, "important");
        root.setProperty("max-height", `${safeH}px`, "important");
      } catch {
        // cross-origin iframe
      }
    }

    function attachIframe(iframe: HTMLIFrameElement) {
      if (observers.has(iframe)) return;
      const ro = new ResizeObserver(() => syncHeight(iframe));
      ro.observe(iframe);
      observers.set(iframe, ro);
      const onLoad = () => syncHeight(iframe);
      loadHandlers.set(iframe, onLoad);
      iframe.addEventListener("load", onLoad);
      syncHeight(iframe);
    }

    function syncIframes() {
      const iframes = document.querySelectorAll("iframe.readium-navigator-iframe");
      for (const iframe of iframes) {
        if (iframe instanceof HTMLIFrameElement) attachIframe(iframe);
      }
    }

    syncIframes();
    const mo = new MutationObserver(syncIframes);
    mo.observe(document.body, { childList: true, subtree: true });

    // When iOS backgrounds a PWA and the user returns, ResizeObserver
    // callbacks may not re-fire even though the rendering context was
    // invalidated.  Force a height re-sync whenever the page becomes
    // visible again.
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        // Allow a frame for the browser to finalise layout after resume.
        requestAnimationFrame(() => {
          for (const iframe of observers.keys()) {
            syncHeight(iframe);
          }
        });
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    // pageshow with persisted=true fires on bfcache restore (iOS PWA
    // app-switcher) — another path where heights can go stale.
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        requestAnimationFrame(() => {
          for (const iframe of observers.keys()) {
            syncHeight(iframe);
          }
        });
      }
    }
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow as EventListener);
      mo.disconnect();
      for (const [iframe, ro] of observers) {
        ro.disconnect();
        const onLoad = loadHandlers.get(iframe);
        if (onLoad) iframe.removeEventListener("load", onLoad);
      }
      observers.clear();
      loadHandlers.clear();
    };
  }, [enabled]);

  return null;
}

/** Watches Thorium Redux state for open panels (TOC, settings) and reports to parent */
function EpubPanelOpenWatcher({ onChange }: { onChange: (open: boolean) => void }) {
  const actionsKeys = useAppSelector((state) => state.actions.keys);
  const anyOpen = useMemo(
    () => Object.values(actionsKeys).some((v) => v && "isOpen" in v && v.isOpen),
    [actionsKeys],
  );
  useEffect(() => {
    onChange(anyOpen);
  }, [anyOpen, onChange]);
  return null;
}

/** Syncs app theme (next-themes + theme variants) to Thorium */
/** Covers the reader area while EPUB iframe content loads */
function EpubLoadingOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background gap-4">
      <MinervaLogo size={48} variant="large" />
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
    </div>
  );
}

function ThoriumThemeSync() {
  const { resolvedTheme } = useTheme();
  const dispatch = useAppDispatch();
  const { preferences, updatePreferences } = usePreferences();
  const { submitPreferences } = useEpubNavigator();
  const prefsRef = useRef(preferences);
  prefsRef.current = preferences;

  const syncThemeColors = useCallback(() => {
    const tokens = getThoriumThemeFromStoredVariants();
    if (tokens) {
      const prefs = prefsRef.current;
      updatePreferences({
        ...prefs,
        theming: {
          ...prefs.theming,
          themes: {
            ...prefs.theming.themes,
            keys: {
              ...prefs.theming.themes.keys,
              [ThThemeKeys.light]: tokens.light as unknown as ThemeTokens,
              [ThThemeKeys.dark]: tokens.dark as unknown as ThemeTokens,
            },
          },
        },
      });
    }
  }, [updatePreferences]);

  useEffect(() => {
    const theme = resolvedTheme === "dark" ? "dark" : "light";
    dispatch(setTheme({ key: "reflow", value: theme }));
    dispatch(setTheme({ key: "fxl", value: theme }));
  }, [resolvedTheme, dispatch]);

  // Force single-column layout
  useEffect(() => {
    dispatch(setColumnCount("1"));
    submitPreferences({ columnCount: 1 });
  }, [dispatch, submitPreferences]);

  useEffect(() => {
    syncThemeColors();
    const observer = new MutationObserver(() => syncThemeColors());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-light-theme", "data-dark-theme", "class"],
    });
    return () => observer.disconnect();
  }, [resolvedTheme, syncThemeColors]);

  // Apply theme to EPUB iframe when theme changes (iframe has its own document, doesn't inherit)
  useEffect(() => {
    const tokens = getThoriumThemeFromStoredVariants();
    if (!tokens) return;
    const theme = resolvedTheme === "dark" ? "dark" : "light";
    const themeTokens = tokens[theme];
    if (!themeTokens) return;
    const apply = () => applyThemeToEpubIframes(themeTokens);
    apply();
    // Retry for late-loading iframes (e.g. book still loading)
    const t1 = setTimeout(apply, 300);
    const t2 = setTimeout(apply, 1000);
    // Re-apply when new EPUB iframes are added (e.g. chapter navigation)
    const observer = new MutationObserver((mutations) => {
      const hasNewIframe = mutations.some((m) =>
        [...m.addedNodes].some(
          (n) => n instanceof HTMLElement && (n.classList?.contains("readium-navigator-iframe") || n.querySelector?.(".readium-navigator-iframe"))
        )
      );
      if (hasNewIframe) apply();
    });
    const root = document.querySelector(".epub-reader-with-custom-toolbar") ?? document.body;
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      observer.disconnect();
    };
  }, [resolvedTheme]);
  return null;
}

/** Navigates to a specific reading order item and highlights quoted text in the EPUB iframe. */
function EpubRefNavigator({
  navRef,
  rawManifest,
}: {
  navRef: { readingOrderIndex: number; quotedText?: string } | null;
  rawManifest: { readingOrder?: Array<{ href?: string }> };
}) {
  const { goLink, getCframes } = useEpubNavigator();
  const highlightCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!navRef) return;

    // Clean up previous highlight
    highlightCleanupRef.current?.();
    highlightCleanupRef.current = null;

    const readingOrder = rawManifest.readingOrder ?? [];
    const targetItem = readingOrder[navRef.readingOrderIndex];
    if (!targetItem?.href) {
      console.warn("[EPUB_NAV] No href for reading order index:", navRef.readingOrderIndex);
      return;
    }

    const quotedText = navRef.quotedText
      ?.replace(/^[""\u201C\u201D]+/, "")
      .replace(/[""\u201C\u201D]+$/, "")
      .trim();

    // Wait for the navigator to finish loading before calling goLink.
    // The navigator's load() is async and calling goLink() before it
    // completes causes a race in apply() → attachListener().
    // We detect readiness by checking that getCframes() returns valid frames.
    let cancelled = false;
    let waitAttempt = 0;
    const maxWaitAttempts = 40; // ~6s

    const waitForNavigatorReady = () => {
      if (cancelled) return;
      waitAttempt++;
      try {
        const frames = getCframes();
        const hasValidFrame = frames?.some(f => f?.iframe?.contentDocument?.body);
        if (hasValidFrame) {
          doNavigate();
          return;
        }
      } catch { /* not ready */ }
      if (waitAttempt < maxWaitAttempts) {
        setTimeout(waitForNavigatorReady, 150);
      } else {
        // Last resort: try anyway
        doNavigate();
      }
    };

    const doNavigate = () => {
      if (cancelled) return;

      console.log("[EPUB_NAV] Navigating to href:", targetItem.href, "readingOrderIndex:", navRef.readingOrderIndex, "quotedText:", quotedText?.slice(0, 60));

      // Use goLink() to navigate to the chapter. We handle text finding + scrolling ourselves.
      const link = new Link({ href: targetItem.href! });
      goLink(link, false, (ok: boolean) => {
        console.log("[EPUB_NAV] goLink callback, ok:", ok);
        if (!ok) return;
        if (!quotedText) return;

        // Poll for iframe content to be ready, then highlight + scroll
        let attempt = 0;
        const maxAttempts = 25;

        const tryHighlight = () => {
          attempt++;

          // Try getCframes first, fall back to querying iframes directly
          let iframeDocs: Document[] = [];
          try {
            const frames = getCframes();
            if (frames) {
              for (const frame of frames) {
                if (!frame) continue;
                try {
                  const doc = frame.iframe?.contentDocument;
                  if (doc?.body) iframeDocs.push(doc);
                } catch { /* cross-origin */ }
              }
            }
          } catch { /* getCframes not available */ }

          // Fallback: query iframes directly
          if (iframeDocs.length === 0) {
            const iframes = document.querySelectorAll("iframe.readium-navigator-iframe");
            for (const iframe of iframes) {
              if (!(iframe instanceof HTMLIFrameElement)) continue;
              try {
                const doc = iframe.contentDocument;
                if (doc?.body) iframeDocs.push(doc);
              } catch { /* cross-origin */ }
            }
          }

          if (iframeDocs.length === 0) {
            if (attempt < maxAttempts) {
              setTimeout(tryHighlight, 150);
            } else {
              console.warn("[EPUB_NAV] Gave up polling for iframe content");
            }
            return;
          }

          console.log("[EPUB_NAV] Found", iframeDocs.length, "iframe doc(s), attempt:", attempt);

          for (const doc of iframeDocs) {
            const result = highlightQuoteInDocument(doc, quotedText);
            if (result) {
              console.log("[EPUB_NAV] Highlight applied successfully");
              highlightCleanupRef.current = result.cleanup;
              return;
            }
          }

          // Text not found yet — iframe may still be loading content
          if (attempt < maxAttempts) {
            setTimeout(tryHighlight, 150);
          } else {
            console.warn("[EPUB_NAV] Quote not found in any iframe after", maxAttempts, "attempts");
          }
        };

        // Delay to let Thorium load the iframe content
        setTimeout(tryHighlight, 300);
      });
    };

    waitForNavigatorReady();

    return () => { cancelled = true; };
  }, [navRef, rawManifest, goLink, getCframes]);

  return null;
}

/** Normalize typography for comparison: curly quotes, ligatures, dashes, ellipsis. */
function normalizeTypography(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/\uFB01/g, "fi").replace(/\uFB02/g, "fl")
    .replace(/\uFB00/g, "ff").replace(/\uFB03/g, "ffi").replace(/\uFB04/g, "ffl")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...");
}

/**
 * Search for quoted text in an EPUB document, highlight it, scroll to it.
 * Returns { cleanup } if found, or null if the quote wasn't found.
 */
function highlightQuoteInDocument(
  doc: Document,
  quotedText: string
): { cleanup: () => void } | null {
  // Collect text nodes and build flat text
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes: { node: Text; start: number; end: number }[] = [];
  let flatText = "";
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? "";
    if (!text) continue;
    const start = flatText.length;
    flatText += text;
    textNodes.push({ node: node as Text, start, end: flatText.length });
  }

  if (!flatText) return null;

  const normalizedFlat = normalizeTypography(flatText);

  // If the quote contains ellipsis (AI abbreviated the original text),
  // try the full quote first, then try to find the first and last segments
  // and highlight the entire range between them.
  const ellipsisSegments = quotedText.split(/\u2026|\.{3,}/).map(s => s.trim()).filter(s => s.length >= 10);
  const hasEllipsis = ellipsisSegments.length > 1;
  const quoteCandidates = [quotedText];
  if (hasEllipsis) {
    // Add all segments as fallback candidates (first, then remaining by length)
    const added = new Set<string>();
    for (const seg of ellipsisSegments) {
      if (!added.has(seg)) { quoteCandidates.push(seg); added.add(seg); }
    }
  }

  // Build normToOrigMap for character expansion (ligatures, ellipsis)
  const charExpansions: Record<string, number> = {
    "\uFB00": 2, "\uFB01": 2, "\uFB02": 2,
    "\uFB03": 3, "\uFB04": 3,
    "\u2026": 3,
  };
  const normToOrigMap: number[] = [];
  {
    let prevWasSpace = false;
    for (let oi = 0; oi < flatText.length; oi++) {
      const ch = flatText[oi]!;
      const expLen = charExpansions[ch];
      if (/\s/.test(ch)) {
        // normalizeTypography doesn't collapse spaces, but we handle whitespace normalization in matching
        normToOrigMap.push(oi);
        prevWasSpace = true;
      } else if (expLen) {
        for (let k = 0; k < expLen; k++) normToOrigMap.push(oi);
        prevWasSpace = false;
      } else {
        normToOrigMap.push(oi);
        prevWasSpace = false;
      }
    }
    void prevWasSpace; // suppress unused warning
  }

  // Helper: map a position in a transformed string back to normalizedFlat position.
  // `transformedIdx` is the index in a string where characters were filtered/collapsed.
  // `charTest` returns true for characters that were KEPT in the transformation.
  function mapTransformedIdxToNormalized(transformedIdx: number, charTest: (ch: string) => boolean): number {
    let ti = 0;
    let ni = 0;
    while (ni < normalizedFlat.length && ti < transformedIdx) {
      if (charTest(normalizedFlat[ni]!)) ti++;
      ni++;
    }
    // Skip leading non-matching chars at target position
    while (ni < normalizedFlat.length && !charTest(normalizedFlat[ni]!)) ni++;
    return ni;
  }

  // Helper: find the end position in normalizedFlat by counting `count` chars that pass `charTest`
  // starting from `startIdx`.
  function findMatchEnd(startIdx: number, count: number, charTest: (ch: string) => boolean): number {
    let matched = 0;
    let ni = startIdx;
    while (ni < normalizedFlat.length && matched < count) {
      if (charTest(normalizedFlat[ni]!)) matched++;
      ni++;
    }
    return ni;
  }

  const lowerFlat = normalizedFlat.toLowerCase();

  // Try matching with each quote candidate (full quote first, then ellipsis segments)
  let matchStart = -1;
  let matchEndNorm = -1;
  let matchLevel = "";
  let normalizedQuote = "";

  for (const candidate of quoteCandidates) {
    normalizedQuote = normalizeTypography(candidate);
    const lowerQuote = normalizedQuote.toLowerCase();

    // Try case-insensitive exact match (most reliable)
    matchStart = lowerFlat.indexOf(lowerQuote);
    if (matchStart >= 0) {
      matchEndNorm = matchStart + normalizedQuote.length;
      matchLevel = "exact";
      break;
    }

    // Fallback: whitespace-collapsed match
    {
      const collapseWs = (s: string) => s.replace(/\s+/g, " ");
      const collapsedFlat = collapseWs(lowerFlat);
      const collapsedQuote = collapseWs(lowerQuote);
      const collapsedIdx = collapsedFlat.indexOf(collapsedQuote);
      if (collapsedIdx >= 0) {
        // Map collapsed position back to normalizedFlat by walking and collapsing whitespace
        let ci = 0;
        let ni = 0;
        let inSpace = false;
        while (ni < normalizedFlat.length && ci < collapsedIdx) {
          const ch = lowerFlat[ni]!;
          if (/\s/.test(ch)) {
            if (!inSpace) { ci++; inSpace = true; }
          } else {
            ci++;
            inSpace = false;
          }
          ni++;
        }
        matchStart = ni;
        let endCi = 0;
        let endNi = matchStart;
        let endInSpace = false;
        while (endNi < normalizedFlat.length && endCi < collapsedQuote.length) {
          const ch = lowerFlat[endNi]!;
          if (/\s/.test(ch)) {
            if (!endInSpace) { endCi++; endInSpace = true; }
          } else {
            endCi++;
            endInSpace = false;
          }
          endNi++;
        }
        matchEndNorm = endNi;
        matchLevel = "ws-collapsed";
        break;
      }
    }

    // Fallback: spaceless match
    {
      const stripFlat = lowerFlat.replace(/\s+/g, "");
      const stripQuote = lowerQuote.replace(/\s+/g, "");
      const stripIdx = stripFlat.indexOf(stripQuote);
      if (stripIdx >= 0) {
        const isNonSpace = (ch: string) => !/\s/.test(ch);
        matchStart = mapTransformedIdxToNormalized(stripIdx, isNonSpace);
        matchEndNorm = findMatchEnd(matchStart, stripQuote.length, isNonSpace);
        matchLevel = "spaceless";
        break;
      }
    }

    // Fallback: alpha-only match (full match only — no partial)
    {
      const isAlphaNum = (ch: string) => /[a-z0-9]/i.test(ch);
      const alphaOnly = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const alphaFlat = alphaOnly(normalizedFlat);
      const alphaQuote = alphaOnly(normalizedQuote);
      const alphaIdx = alphaFlat.indexOf(alphaQuote);

      if (alphaIdx >= 0) {
        matchStart = mapTransformedIdxToNormalized(alphaIdx, isAlphaNum);
        matchEndNorm = findMatchEnd(matchStart, alphaQuote.length, isAlphaNum);
        matchLevel = "alpha";
        break;
      }
    }

    // Reset for next candidate
    matchStart = -1;
    matchEndNorm = -1;
  }

  // If the full quote didn't match but we matched an ellipsis segment,
  // try to find the first and last segments to highlight the entire original range.
  // Pick the (first, last) pair with the smallest gap to avoid matching distant occurrences.
  if (matchStart >= 0 && hasEllipsis && normalizedQuote !== normalizeTypography(quotedText)) {
    const firstSeg = ellipsisSegments[0]!;
    const lastSeg = ellipsisSegments[ellipsisSegments.length - 1]!;
    const normFirstSeg = normalizeTypography(firstSeg).toLowerCase();
    const normLastSeg = normalizeTypography(lastSeg).toLowerCase();

    // Find all occurrences of the first segment
    let bestStart = -1;
    let bestEnd = -1;
    let bestGap = Infinity;
    let searchPos = 0;
    while (searchPos < lowerFlat.length) {
      const firstIdx = lowerFlat.indexOf(normFirstSeg, searchPos);
      if (firstIdx < 0) break;
      // Look for the last segment after this first segment
      const lastIdx = lowerFlat.indexOf(normLastSeg, firstIdx + normFirstSeg.length);
      if (lastIdx >= 0) {
        const gap = lastIdx - (firstIdx + normFirstSeg.length);
        if (gap < bestGap) {
          bestStart = firstIdx;
          bestEnd = lastIdx + normLastSeg.length;
          bestGap = gap;
        }
      }
      searchPos = firstIdx + 1;
    }

    if (bestStart >= 0 && bestEnd >= 0) {
      matchStart = bestStart;
      matchEndNorm = bestEnd;
      matchLevel = "ellipsis-range";
      console.log("[EPUB_NAV] Ellipsis range: gap=", bestGap, "chars between segments");
    }
  }

  if (matchStart < 0 || matchEndNorm < 0) return null;

  // Map normalized match range back to original flat text positions
  const origStart = normToOrigMap[matchStart] ?? 0;
  const origEnd = (normToOrigMap[Math.min(matchEndNorm - 1, normToOrigMap.length - 1)] ?? origStart) + 1;

  // Log what we actually matched
  const matchedText = flatText.slice(origStart, origEnd);
  console.log("[EPUB_NAV] Match level:", matchLevel, "matched:", JSON.stringify(matchedText.slice(0, 100)), "origStart:", origStart, "origEnd:", origEnd, "flatLen:", flatText.length);

  // Create <mark> elements across text nodes
  const marks: HTMLElement[] = [];
  for (const { node: textNode, start, end } of textNodes) {
    if (end <= origStart || start >= origEnd) continue;
    const text = textNode.textContent ?? "";
    const localStart = Math.max(0, origStart - start);
    const localEnd = Math.min(text.length, origEnd - start);

    const frag = doc.createDocumentFragment();
    if (localStart > 0) {
      frag.appendChild(doc.createTextNode(text.slice(0, localStart)));
    }
    const mark = doc.createElement("mark");
    mark.className = "epub-ref-highlight";
    mark.style.cssText = "background-color: rgba(255, 200, 0, 0.5) !important; border-radius: 2px !important; color: inherit !important;";
    mark.textContent = text.slice(localStart, localEnd);
    marks.push(mark);
    frag.appendChild(mark);
    if (localEnd < text.length) {
      frag.appendChild(doc.createTextNode(text.slice(localEnd)));
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }

  // Navigate to the page/position containing the first mark.
  // We defer this slightly to let the DOM settle after mark insertion.
  if (marks[0]) {
    const markEl = marks[0];
    requestAnimationFrame(() => {
      const wnd = doc.defaultView;
      if (!wnd) return;

      const rootStyle = wnd.getComputedStyle(doc.documentElement);
      const bodyStyle = wnd.getComputedStyle(doc.body);
      const colCountStr = rootStyle.getPropertyValue("column-count");
      const colCount = parseInt(colCountStr, 10);
      const bodyColCount = parseInt(bodyStyle.getPropertyValue("column-count"), 10);
      const effectiveColCount = (!Number.isNaN(colCount) && colCount >= 1) ? colCount
        : (!Number.isNaN(bodyColCount) && bodyColCount >= 1) ? bodyColCount : 0;

      const rect = markEl.getBoundingClientRect();
      const scrollEl = doc.scrollingElement ?? doc.documentElement;

      console.log("[EPUB_NAV] Positioning: colCount=", colCountStr,
        "scrollHeight=", scrollEl.scrollHeight, "clientHeight=", scrollEl.clientHeight,
        "scrollTop=", scrollEl.scrollTop,
        "mark rect:", JSON.stringify({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }));

      if (effectiveColCount >= 1) {
        // Paginated (CSS columns): snap scrollLeft to the column containing the mark.
        const docOffsetX = rect.left + wnd.scrollX;
        const pageWidth = wnd.innerWidth;
        const snappedScroll = docOffsetX - (docOffsetX % pageWidth);
        scrollEl.scrollLeft = snappedScroll;
        console.log("[EPUB_NAV] Paginated snap: scrollLeft=", snappedScroll);
      } else if (scrollEl.scrollHeight > scrollEl.clientHeight) {
        // Vertically scrollable: scroll the documentElement to the mark
        const markDocTop = rect.top + scrollEl.scrollTop;
        const targetScroll = markDocTop - scrollEl.clientHeight / 3; // put mark in upper third
        scrollEl.scrollTop = Math.max(0, targetScroll);
        console.log("[EPUB_NAV] Scroll to mark: markDocTop=", markDocTop, "scrollTop=", scrollEl.scrollTop);
      } else {
        // Fallback
        console.log("[EPUB_NAV] Fallback scrollIntoView");
        markEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      // Notify Thorium's ColumnSnapper/ScrollSnapper of the new scroll position
      // so it recalculates progress and updates the position indicator in the toolbar.
      setTimeout(() => wnd.dispatchEvent(new Event("resize")), 100);
    });
  }

  // Auto-clear after 5 seconds
  const cleanup = () => {
    for (const mark of marks) {
      const parent = mark.parentNode;
      if (!parent) continue;
      const textNode = doc.createTextNode(mark.textContent ?? "");
      parent.replaceChild(textNode, mark);
      // Normalize adjacent text nodes
      parent.normalize();
    }
  };

  const timer = setTimeout(cleanup, 5000);
  return {
    cleanup: () => {
      clearTimeout(timer);
      cleanup();
    },
  };
}

/**
 * Captures and restores the exact EPUB reading position (Locator) for the
 * reading-anchor "return to where you were" feature.  Lives inside the Thorium
 * store context so it can call useEpubNavigator.
 */
function EpubReadingAnchor({
  saveRef,
  restoreRef,
}: {
  saveRef: React.RefObject<() => boolean>;
  restoreRef: React.RefObject<() => void>;
}) {
  const { go, currentLocator } = useEpubNavigator();
  const savedLocatorRef = useRef<Locator | null>(null);

  // Expose save/restore to the parent via refs
  useEffect(() => {
    (saveRef as React.MutableRefObject<() => boolean>).current = () => {
      const loc = currentLocator();
      if (!loc) return false;
      savedLocatorRef.current = loc;
      return true;
    };
    (restoreRef as React.MutableRefObject<() => void>).current = () => {
      const loc = savedLocatorRef.current;
      if (!loc) return;
      go(loc, false, () => {});
      savedLocatorRef.current = null;
    };
  }, [saveRef, restoreRef, go, currentLocator]);

  return null;
}

/** Syncs EPUB reading position from localStorage (written by Thorium) to our API. Skips API when not logged in (curated books). */
function EpubPositionSync({ bookId, storageKey, isLoggedIn }: { bookId: string; storageKey: string; isLoggedIn: boolean }) {
  const lastSavedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoggedIn) return;
    const interval = setInterval(() => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return;
        if (raw === lastSavedRef.current) return;
        lastSavedRef.current = raw;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed?.href) return;
        fetch(`/api/books/${bookId}/reading-position`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ readingPosition: parsed }),
        }).catch(() => {});
      } catch {
        // Ignore parse errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [bookId, storageKey, isLoggedIn]);
  return null;
}
