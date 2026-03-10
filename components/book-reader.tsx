"use client";

import {
  StatefulReader,
  StatefulPreferencesProvider,
  ThStoreProvider,
  ThI18nProvider,
  setTheme,
  setScroll,
  useAppDispatch,
  usePreferences,
} from "@edrlab/thorium-web/epub";
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
import { useParams } from "next/navigation";
import { useSelectedText } from "@/lib/use-selected-text";
import { useIsMobile } from "@/lib/use-media-query";
import { hapticLight } from "@/lib/haptic";
import { getLiveSelectedText, getTextSelection } from "@/lib/book-position-utils";
import { getThoriumThemeFromStoredVariants } from "@/lib/theme-variants";

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
  (k) => k !== ThSettingsKeys.theme
);
const MOBILE_SETTINGS_REFLOW_ORDER = DESKTOP_SETTINGS_REFLOW_ORDER.filter(
  (k) => k !== ThSettingsKeys.layout
);

/** Preferences with Themes panel hidden, Jump to position removed, mobile layout removed. */
function createThoriumPreferences(isMobile: boolean) {
  return createPreferences({
    ...defaultPreferences,
    settings: {
      ...defaultPreferences.settings,
      reflowOrder: isMobile ? MOBILE_SETTINGS_REFLOW_ORDER : DESKTOP_SETTINGS_REFLOW_ORDER,
      fxlOrder: defaultPreferences.settings.fxlOrder.filter((k) => k !== ThSettingsKeys.theme),
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
  });
}

const EPUB_STORAGE_KEY_SUFFIX = "-current-location";

interface BookReaderProps {
  rawManifest: { readingOrder?: Array<{ href?: string }> };
  selfHref: string;
  initialReadingPosition?: Record<string, unknown> | null;
  isLoggedIn?: boolean;
}

export function BookReader({ rawManifest, selfHref, initialReadingPosition, isLoggedIn = false }: BookReaderProps) {
  const [mounted, setMounted] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const isMobile = useIsMobile();
  const selectedText = useSelectedText();
  const params = useParams();
  const bookId = params?.bookId as string;
  const thoriumPreferences = useMemo(() => createThoriumPreferences(isMobile), [isMobile]);

  const aiNonceRef = useRef(0);
  const [aiRequest, setAiRequest] = useState<{ nonce: number; action: "page" | "selection" } | null>(null);
  const openAiNonceRef = useRef(0);
  const [openAiRequest, setOpenAiRequest] = useState<{ nonce: number } | null>(null);
  const [isAiPaneOpen, setIsAiPaneOpen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [mobileDrawerAnchor, setMobileDrawerAnchor] = useState<"top" | "bottom">("bottom");
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
  const mobileTopToolbarVisible = chromeVisible && !selectionExists;

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

  if (!mounted || !storageReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading reader...</p>
        </div>
      </div>
    );
  }

  return (
    <ThStoreProvider>
      <StatefulPreferencesProvider
        key={isMobile ? "mobile" : "desktop"}
        initialPreferences={thoriumPreferences}
      >
        <ThI18nProvider>
          <ThoriumThemeSync />
          <EpubMobileLayoutForce />
          <EpubSelectionTouchGuard enabled={isMobile} />
          <EpubMobileCenterTapToggle enabled={isMobile} onToggle={toggleChrome} />
          <div className={`epub-reader-with-custom-toolbar w-full flex flex-col ${isMobile ? "h-svh" : "h-screen"}`}>
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
                    if (target?.closest("button,a,input,textarea,select,[role='button']")) return;
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
                  </div>
                  {chromeVisible && (
                    <AIAssistant
                      selectedText={selectedText}
                      bookId={bookId}
                      rawManifest={rawManifest}
                      bookType="epub"
                      mobileDrawerMinMode="quick"
                      mobileDrawerAnchor={mobileDrawerAnchor}
                      requestRun={aiRequest}
                      requestOpen={openAiRequest}
                      onOpenChange={setIsAiPaneOpen}
                    />
                  )}
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
                  </div>
                  <AIAssistant
                    selectedText={selectedText}
                    bookId={bookId}
                    rawManifest={rawManifest}
                    bookType="epub"
                    requestRun={aiRequest}
                    requestOpen={openAiRequest}
                    onOpenChange={setIsAiPaneOpen}
                  />
                </div>
              </>
            )}

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
        const suppressTouchGesture = (event: TouchEvent) => {
          if (event.touches.length > 1) return;
          if (!shouldSuppressSwipe()) return;
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

/** Syncs app theme (next-themes + theme variants) to Thorium */
function ThoriumThemeSync() {
  const { resolvedTheme } = useTheme();
  const dispatch = useAppDispatch();
  const { preferences, updatePreferences } = usePreferences();
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
