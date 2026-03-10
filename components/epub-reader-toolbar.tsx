"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  BookOpenText,
  Highlighter,
  Search,
  Settings,
  List,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useSelectedText } from "@/lib/use-selected-text";
import { useAppSelector, useAppDispatch, setActionOpen } from "@edrlab/thorium-web/epub";
import { hapticLight } from "@/lib/haptic";
import { useIsMobile } from "@/lib/use-media-query";

interface EpubReaderToolbarProps {
  onRequestAiRun: (action: "page" | "selection") => void;
  onRequestAiOpen: () => void;
  isAiPaneOpen: boolean;
}

/** Formats EPUB position from Thorium timeline for display in the toolbar */
function useEpubPositionLabel(): string {
  const timeline = useAppSelector((state) => state.publication.unstableTimeline);
  const progression = timeline?.progression;

  if (!progression) return "";

  const {
    currentChapter,
    currentIndex,
    totalItems,
    relativeProgression,
    totalProgression,
  } = progression;

  // Show chapter title only (no position)
  if (currentChapter) return currentChapter;

  // Fallback: index + total
  if (typeof currentIndex === "number" && typeof totalItems === "number" && totalItems > 0) {
    return `${currentIndex + 1} / ${totalItems}`;
  }

  // Percentage
  if (typeof totalProgression === "number") {
    return `${Math.round(totalProgression * 100)}%`;
  }
  if (typeof relativeProgression === "number") {
    return `${Math.round(relativeProgression * 100)}%`;
  }

  return "";
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
  const positionLabel = useEpubPositionLabel();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const openSettings = useCallback(() => {
    dispatch(setActionOpen({ key: "settings", isOpen: true }));
  }, [dispatch]);

  const openToc = useCallback(() => {
    dispatch(setActionOpen({ key: "toc", isOpen: true }));
  }, [dispatch]);

  return (
    <div className="relative grid grid-cols-[1fr_auto_1fr] items-center px-4 py-2 border-b bg-background text-foreground shrink-0">
      <div className="min-w-0 flex items-center gap-2 justify-self-start">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 shrink-0"
          onClick={() => {
            hapticLight();
            router.back();
          }}
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex items-center justify-center gap-2 min-w-0 justify-self-center">
        {!isMobile &&
          (positionLabel ? (
            <span
              className="text-sm text-muted-foreground select-none truncate max-w-[200px]"
              title={positionLabel}
            >
              {positionLabel}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground select-none">—</span>
          ))}
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
              onClick={() => setIsSearchOpen(false)}
              aria-label="Close search"
            >
              <span className="text-lg leading-none">×</span>
            </Button>
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search text..."
              className="h-9 flex-1"
            />
            <Button type="button" disabled={!searchQuery.trim()} title="Search (not implemented yet)">
              Search
            </Button>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            <p>Text search results will appear here. Not implemented yet.</p>
          </div>
        </div>
      )}
    </div>
  );
}
