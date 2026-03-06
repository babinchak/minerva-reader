"use client";

import {
  StatefulReader,
  StatefulPreferencesProvider,
  ThStoreProvider,
  ThI18nProvider,
  setTheme,
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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EpubReaderToolbar } from "@/components/epub-reader-toolbar";
import { useTheme } from "next-themes";
import { AIAssistant } from "@/components/ai-assistant";
import { useParams } from "next/navigation";
import { useSelectedText } from "@/lib/use-selected-text";
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

/** Preferences with Themes panel hidden, Jump to position removed - theme colors injected dynamically */
const thoriumPreferences = createPreferences({
  ...defaultPreferences,
  settings: {
    ...defaultPreferences.settings,
    reflowOrder: defaultPreferences.settings.reflowOrder.filter((k) => k !== ThSettingsKeys.theme),
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

const EPUB_STORAGE_KEY_SUFFIX = "-current-location";

interface BookReaderProps {
  rawManifest: { readingOrder?: Array<{ href?: string }> };
  selfHref: string;
  initialReadingPosition?: Record<string, unknown> | null;
}

export function BookReader({ rawManifest, selfHref, initialReadingPosition }: BookReaderProps) {
  const [mounted, setMounted] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const selectedText = useSelectedText();
  const params = useParams();
  const bookId = params?.bookId as string;

  const aiNonceRef = useRef(0);
  const [aiRequest, setAiRequest] = useState<{ nonce: number; action: "page" | "selection" } | null>(null);
  const openAiNonceRef = useRef(0);
  const [openAiRequest, setOpenAiRequest] = useState<{ nonce: number } | null>(null);
  const [isAiPaneOpen, setIsAiPaneOpen] = useState(false);

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
      <StatefulPreferencesProvider initialPreferences={thoriumPreferences}>
        <ThI18nProvider>
          <ThoriumThemeSync />
          <div className="epub-reader-with-custom-toolbar w-full h-screen flex flex-col">
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
              <div className="flex-1 min-w-0 h-full">
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

            <EpubPositionSync bookId={bookId} storageKey={`${selfHref}${EPUB_STORAGE_KEY_SUFFIX}`} />
          </div>
        </ThI18nProvider>
      </StatefulPreferencesProvider>
    </ThStoreProvider>
  );
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

/** Syncs app theme (next-themes + theme variants) to Thorium */
function ThoriumThemeSync() {
  const { resolvedTheme } = useTheme();
  const dispatch = useAppDispatch();
  const { preferences, updatePreferences } = usePreferences();
  const prefsRef = useRef(preferences);
  prefsRef.current = preferences;

  const syncThemeColors = () => {
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
  };

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
  }, [resolvedTheme]);

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

/** Syncs EPUB reading position from localStorage (written by Thorium) to our API */
function EpubPositionSync({ bookId, storageKey }: { bookId: string; storageKey: string }) {
  const lastSavedRef = useRef<string | null>(null);
  useEffect(() => {
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
  }, [bookId, storageKey]);
  return null;
}
