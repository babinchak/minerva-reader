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
import { useAppSelector, useAppDispatch, setActionOpen, useEpubNavigator } from "@edrlab/thorium-web/epub";
import { hapticLight } from "@/lib/haptic";
import { useIsMobile } from "@/lib/use-media-query";

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

  const { go } = useEpubNavigator();

  const [positionInput, setPositionInput] = useState(currentPosition != null ? String(currentPosition) : "");
  const [isEditingPosition, setIsEditingPosition] = useState(false);

  // Keep input in sync with current position when not editing
  if (!isEditingPosition && currentPosition != null && positionInput !== String(currentPosition)) {
    setPositionInput(String(currentPosition));
  }

  const commitPositionInput = useCallback(() => {
    const parsed = Number.parseInt(positionInput, 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > totalPositions || !positionsList?.length) {
      if (currentPosition != null) setPositionInput(String(currentPosition));
      return;
    }
    // positionsList is 0-indexed, positions are 1-based
    const locator = positionsList[parsed - 1];
    if (locator) {
      go(locator, true, () => {});
    }
  }, [positionInput, totalPositions, positionsList, currentPosition, go]);

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
