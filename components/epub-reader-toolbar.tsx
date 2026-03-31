"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  BookOpenText,
  ChevronDown,
  ChevronUp,
  Highlighter,
  Search,
  Settings,
  List,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useSelectedText } from "@/lib/use-selected-text";
import { useAppSelector, useAppDispatch, setActionOpen, useEpubNavigator } from "@edrlab/thorium-web/epub";
import { hapticLight } from "@/lib/haptic";
import { useIsMobile } from "@/lib/use-media-query";

// ---------------------------------------------------------------------------
// EPUB find-in-chapter helpers
// ---------------------------------------------------------------------------

const HIGHLIGHT_COLOR = "rgba(255, 200, 0, 0.4)";
const SELECTED_COLOR = "rgba(255, 130, 0, 0.6)";

/** Collect content documents from Readium navigator iframes. */
function getEpubIframeDocs(
  getCframes: ReturnType<typeof useEpubNavigator>["getCframes"]
): Document[] {
  const docs: Document[] = [];

  // Primary: use Thorium's getCframes API
  try {
    const frames = getCframes();
    if (frames) {
      for (const frame of frames) {
        if (!frame) continue;
        try {
          const doc = (frame as any).iframe?.contentDocument as Document | undefined;
          if (doc?.body) docs.push(doc);
        } catch { /* cross-origin */ }
      }
    }
  } catch { /* getCframes unavailable */ }

  // Fallback: query iframes directly
  if (docs.length === 0) {
    const iframes = document.querySelectorAll("iframe.readium-navigator-iframe");
    for (const iframe of iframes) {
      if (!(iframe instanceof HTMLIFrameElement)) continue;
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) docs.push(doc);
      } catch { /* cross-origin */ }
    }
  }

  return docs;
}

/**
 * Find all case-insensitive occurrences of `query` in `doc`, wrap each in
 * <mark> elements, and return per-match mark groups plus a cleanup function.
 */
function findAllInDocument(
  doc: Document,
  query: string
): { matchGroups: HTMLElement[][]; cleanup: () => void } {
  const empty = { matchGroups: [] as HTMLElement[][], cleanup: () => {} };

  // Collect text nodes and build a flat-text representation
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const tag = node.parentElement?.tagName;
      if (tag === "SCRIPT" || tag === "STYLE") return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const textNodes: { node: Text; start: number }[] = [];
  let flatText = "";
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n.textContent ?? "";
    if (!t) continue;
    textNodes.push({ node: n as Text, start: flatText.length });
    flatText += t;
  }

  if (!flatText) return empty;

  // Locate every occurrence (case-insensitive)
  const lowerFlat = flatText.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const positions: { start: number; end: number }[] = [];
  let pos = 0;
  while (pos <= lowerFlat.length - lowerQuery.length) {
    const idx = lowerFlat.indexOf(lowerQuery, pos);
    if (idx < 0) break;
    positions.push({ start: idx, end: idx + lowerQuery.length });
    pos = idx + 1;
  }

  if (positions.length === 0) return empty;

  // For each text node, compute which matches overlap it and insert <mark>s
  const matchGroups: HTMLElement[][] = positions.map(() => []);
  const allMarks: HTMLElement[] = [];

  for (const { node: textNode, start: nodeStart } of textNodes) {
    const nodeText = textNode.textContent ?? "";
    const nodeEnd = nodeStart + nodeText.length;

    // Gather local highlight ranges from all overlapping matches
    const ranges: { localStart: number; localEnd: number; matchIndex: number }[] = [];
    for (let mi = 0; mi < positions.length; mi++) {
      const m = positions[mi];
      if (m.end <= nodeStart || m.start >= nodeEnd) continue;
      ranges.push({
        localStart: Math.max(0, m.start - nodeStart),
        localEnd: Math.min(nodeText.length, m.end - nodeStart),
        matchIndex: mi,
      });
    }

    if (ranges.length === 0) continue;
    ranges.sort((a, b) => a.localStart - b.localStart);

    // Build a replacement fragment with <mark> spans interleaved
    const frag = doc.createDocumentFragment();
    let lastEnd = 0;

    for (const { localStart, localEnd, matchIndex } of ranges) {
      if (localStart > lastEnd) {
        frag.appendChild(doc.createTextNode(nodeText.slice(lastEnd, localStart)));
      }
      const mark = doc.createElement("mark");
      mark.className = "epub-find-highlight";
      mark.dataset.matchIndex = String(matchIndex);
      mark.style.cssText =
        `background-color: ${HIGHLIGHT_COLOR} !important; border-radius: 2px !important; color: inherit !important; padding: 0 !important; margin: 0 !important;`;
      mark.textContent = nodeText.slice(localStart, localEnd);
      frag.appendChild(mark);
      allMarks.push(mark);
      matchGroups[matchIndex].push(mark);
      lastEnd = localEnd;
    }

    if (lastEnd < nodeText.length) {
      frag.appendChild(doc.createTextNode(nodeText.slice(lastEnd)));
    }

    textNode.parentNode?.replaceChild(frag, textNode);
  }

  const cleanup = () => {
    for (const mark of allMarks) {
      const parent = mark.parentNode;
      if (!parent) continue;
      parent.replaceChild(doc.createTextNode(mark.textContent ?? ""), mark);
      parent.normalize();
    }
  };

  return { matchGroups, cleanup };
}

/** Scroll an EPUB mark into view, handling both paginated and scrollable layouts. */
function scrollEpubMarkIntoView(mark: HTMLElement) {
  const doc = mark.ownerDocument;
  const wnd = doc?.defaultView;
  if (!doc || !wnd) return;

  requestAnimationFrame(() => {
    const rootStyle = wnd.getComputedStyle(doc.documentElement);
    const bodyStyle = wnd.getComputedStyle(doc.body);
    const colCount = parseInt(rootStyle.getPropertyValue("column-count"), 10);
    const bodyColCount = parseInt(bodyStyle.getPropertyValue("column-count"), 10);
    const effectiveColCount =
      !Number.isNaN(colCount) && colCount >= 1
        ? colCount
        : !Number.isNaN(bodyColCount) && bodyColCount >= 1
          ? bodyColCount
          : 0;

    const rect = mark.getBoundingClientRect();
    const scrollEl = doc.scrollingElement ?? doc.documentElement;

    if (effectiveColCount >= 1) {
      // Paginated (CSS columns): snap scrollLeft to the column containing the mark
      const docOffsetX = rect.left + wnd.scrollX;
      const pageWidth = wnd.innerWidth;
      scrollEl.scrollLeft = docOffsetX - (docOffsetX % pageWidth);
    } else if (scrollEl.scrollHeight > scrollEl.clientHeight) {
      // Scrollable: put the mark in the upper third
      const markDocTop = rect.top + scrollEl.scrollTop;
      scrollEl.scrollTop = Math.max(0, markDocTop - scrollEl.clientHeight / 3);
    } else {
      mark.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EpubReaderToolbarProps {
  onRequestAiRun: (action: "page" | "selection") => void;
  onRequestAiOpen: () => void;
  isAiPaneOpen: boolean;
}

export function EpubReaderToolbar({
  onRequestAiRun,
  onRequestAiOpen,
  isAiPaneOpen,
}: EpubReaderToolbarProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const selectedText = useSelectedText();
  const selectionExists = Boolean(selectedText && selectedText.trim().length > 0);
  const dispatch = useAppDispatch();

  const timeline = useAppSelector((state) => state.publication.unstableTimeline);
  const positionsList = useAppSelector((state) => state.publication.positionsList);
  const progression = timeline?.progression;
  const totalPositions = progression?.totalPositions ?? positionsList?.length ?? 0;
  const currentPositions = progression?.currentPositions;
  const currentPosition = currentPositions?.[0] ?? null;

  const { go, getCframes } = useEpubNavigator();

  // -- Position input -------------------------------------------------------
  const [positionInput, setPositionInput] = useState(currentPosition != null ? String(currentPosition) : "");
  const [isEditingPosition, setIsEditingPosition] = useState(false);

  if (!isEditingPosition && currentPosition != null && positionInput !== String(currentPosition)) {
    setPositionInput(String(currentPosition));
  }

  const commitPositionInput = useCallback(() => {
    const parsed = Number.parseInt(positionInput, 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > totalPositions || !positionsList?.length) {
      if (currentPosition != null) setPositionInput(String(currentPosition));
      return;
    }
    const locator = positionsList[parsed - 1];
    if (locator) {
      go(locator, true, () => {});
    }
  }, [positionInput, totalPositions, positionsList, currentPosition, go]);

  // -- Search / Find state --------------------------------------------------
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [findMatches, setFindMatches] = useState<{ current: number; total: number } | null>(null);

  const findCleanupRef = useRef<(() => void) | null>(null);
  const matchGroupsRef = useRef<HTMLElement[][]>([]);
  const findCurrentIndexRef = useRef(0);

  const clearFind = useCallback(() => {
    findCleanupRef.current?.();
    findCleanupRef.current = null;
    matchGroupsRef.current = [];
    findCurrentIndexRef.current = 0;
    setFindMatches(null);
  }, []);

  const selectMatch = useCallback((index: number) => {
    const groups = matchGroupsRef.current;
    if (groups.length === 0) return;

    // Deselect previous
    const prev = groups[findCurrentIndexRef.current];
    if (prev) {
      for (const m of prev) m.style.setProperty("background-color", HIGHLIGHT_COLOR, "important");
    }

    // Select new (wrap around)
    const wrapped = ((index % groups.length) + groups.length) % groups.length;
    findCurrentIndexRef.current = wrapped;
    const curr = groups[wrapped];
    if (curr?.length) {
      for (const m of curr) m.style.setProperty("background-color", SELECTED_COLOR, "important");
      scrollEpubMarkIntoView(curr[0]);
    }

    setFindMatches({ current: wrapped + 1, total: groups.length });
  }, []);

  const runFind = useCallback(() => {
    const query = searchQuery.trim();
    if (!query) return;

    clearFind();

    const docs = getEpubIframeDocs(getCframes);
    let allGroups: HTMLElement[][] = [];
    const cleanups: (() => void)[] = [];

    for (const doc of docs) {
      const { matchGroups, cleanup } = findAllInDocument(doc, query);
      allGroups = allGroups.concat(matchGroups);
      cleanups.push(cleanup);
    }

    matchGroupsRef.current = allGroups;
    findCleanupRef.current = () => cleanups.forEach((c) => c());

    if (allGroups.length > 0) {
      selectMatch(0);
    } else {
      setFindMatches({ current: 0, total: 0 });
    }
  }, [searchQuery, getCframes, clearFind, selectMatch]);

  const findNext = useCallback(() => {
    if (matchGroupsRef.current.length === 0) return;
    selectMatch(findCurrentIndexRef.current + 1);
  }, [selectMatch]);

  const findPrev = useCallback(() => {
    if (matchGroupsRef.current.length === 0) return;
    selectMatch(findCurrentIndexRef.current - 1);
  }, [selectMatch]);

  const closeSearch = useCallback(() => {
    clearFind();
    setIsSearchOpen(false);
  }, [clearFind]);

  // Clean up highlights on unmount
  useEffect(() => {
    return () => {
      findCleanupRef.current?.();
    };
  }, []);

  // -- Other toolbar actions ------------------------------------------------
  const openSettings = useCallback(() => {
    dispatch(setActionOpen({ key: "settings", isOpen: true }));
  }, [dispatch]);

  const openToc = useCallback(() => {
    dispatch(setActionOpen({ key: "toc", isOpen: true }));
  }, [dispatch]);

  // -- Render ---------------------------------------------------------------
  const hasMatches = findMatches != null && findMatches.total > 0;
  const statusLine =
    findMatches && findMatches.total === 0
      ? "No matches"
      : findMatches && findMatches.total > 0
        ? `${findMatches.current} / ${findMatches.total}`
        : null;

  return (
    <div className="relative grid grid-cols-[1fr_auto_1fr] items-center px-4 py-2 border-b bg-background text-foreground shrink-0">
      <div className="min-w-0 flex items-center gap-2 justify-self-start">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 shrink-0"
          onClick={() => {
            hapticLight();
            router.push("/");
          }}
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex items-center justify-center gap-2 min-w-0 justify-self-center">
        {!isMobile && totalPositions > 0 && (
          <>
            <Input
              value={positionInput}
              onChange={(e) => setPositionInput(e.target.value)}
              onFocus={() => setIsEditingPosition(true)}
              onBlur={() => {
                setIsEditingPosition(false);
                commitPositionInput();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.currentTarget as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  if (currentPosition != null) setPositionInput(String(currentPosition));
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              inputMode="numeric"
              aria-label="Current position"
              className="h-8 w-16 text-center"
            />
            <span className="text-sm text-muted-foreground select-none">
              / {totalPositions}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 justify-self-end">
        <ThemeSwitcher />
        <Button
          variant="ghost"
          size="icon"
          onClick={openSettings}
          aria-label="Display settings"
          title="Display settings"
          className="shrink-0"
        >
          <Settings className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={openToc}
          aria-label="Table of contents"
          title="Table of contents"
          className="shrink-0"
        >
          <List className="h-5 w-5" />
        </Button>
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
          onClick={() => onRequestAiRun("selection")}
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
          onClick={() => onRequestAiRun("page")}
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
            onClick={onRequestAiOpen}
            aria-label="Ask Minerva"
            title="Ask Minerva"
            className="hidden md:inline-flex"
          >
            Ask Minerva
          </Button>
        )}
      </div>

      {isSearchOpen && (
        <div className="absolute right-4 top-full mt-2 z-50 w-[min(520px,calc(100vw-2rem))] rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-3 col-span-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Search</span>
            <div className="flex-1" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={closeSearch}
              aria-label="Close search"
            >
              <span className="text-lg leading-none">×</span>
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              autoFocus
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setFindMatches(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runFind();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  closeSearch();
                }
              }}
              placeholder="Search text…"
              className="h-9 flex-1 min-w-[140px]"
              aria-label="Search in document"
            />
            <div className="flex items-center gap-1 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!hasMatches}
                title="Previous match"
                aria-label="Previous match"
                onClick={findPrev}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!hasMatches}
                title="Next match"
                aria-label="Next match"
                onClick={findNext}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            <Button
              type="button"
              disabled={!searchQuery.trim()}
              title="Find in document"
              onClick={runFind}
            >
              Find
            </Button>
          </div>

          <div
            className="mt-3 text-sm text-muted-foreground min-h-[1.25rem]"
            aria-live="polite"
          >
            {statusLine}
          </div>
        </div>
      )}
    </div>
  );
}
