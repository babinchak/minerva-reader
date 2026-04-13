"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  BookOpen,
  Calendar,
  Check,
  Clock,
  FileText,
} from "lucide-react";
import type {
  LibraryBookFilter,
  LibrarySortDir,
  LibrarySortType,
} from "@/components/library-sort-controls";

const SORT_OPTIONS: { value: LibrarySortType; label: string; icon: React.ReactNode }[] = [
  { value: "lastOpened", label: "Last opened", icon: <Clock className="h-4 w-4" /> },
  { value: "dateAdded", label: "Date added", icon: <Calendar className="h-4 w-4" /> },
  { value: "title", label: "Title", icon: <ArrowDownAZ className="h-4 w-4" /> },
];

const FILTER_OPTIONS: { value: LibraryBookFilter; label: string; icon?: React.ReactNode }[] = [
  { value: "all", label: "All books" },
  { value: "epub", label: "EPUB only", icon: <BookOpen className="h-4 w-4" /> },
  { value: "pdf", label: "PDF only", icon: <FileText className="h-4 w-4" /> },
];

interface MobileFilterSortSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sort: LibrarySortType;
  dir: LibrarySortDir;
  filter: LibraryBookFilter;
  onSortChange: (sort: LibrarySortType, dir: LibrarySortDir) => void;
  onFilterChange: (filter: LibraryBookFilter) => void;
  excludeSortOptions?: LibrarySortType[];
}

export function MobileFilterSortSheet({
  open,
  onOpenChange,
  sort,
  dir,
  filter,
  onSortChange,
  onFilterChange,
  excludeSortOptions,
}: MobileFilterSortSheetProps) {
  const sortOptions = excludeSortOptions
    ? SORT_OPTIONS.filter((o) => !excludeSortOptions.includes(o.value))
    : SORT_OPTIONS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="bottom-sheet"
        showCloseButton={false}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        <DialogHeader className="px-5 pb-2">
          <DialogTitle className="text-base">Filter & Sort</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-5 pb-6">
          {/* Filter section */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Filter
            </p>
            <div className="flex flex-col gap-1">
              {FILTER_OPTIONS.map((option) => {
                const isActive = option.value === filter;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onFilterChange(option.value)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      isActive
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    {option.icon && <span className="text-muted-foreground">{option.icon}</span>}
                    {!option.icon && <span className="w-4" />}
                    <span className="flex-1 text-left">{option.label}</span>
                    {isActive && <Check className="h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sort section */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sort by
            </p>
            <div className="flex flex-col gap-1">
              {sortOptions.map((option) => {
                const isActive = option.value === sort;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onSortChange(option.value, dir)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      isActive
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <span className="text-muted-foreground">{option.icon}</span>
                    <span className="flex-1 text-left">{option.label}</span>
                    {isActive && <Check className="h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Direction toggle */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Order
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={dir === "desc" ? "default" : "outline"}
                size="sm"
                onClick={() => onSortChange(sort, "desc")}
                className="gap-2"
              >
                <ArrowDownAZ className="h-4 w-4" />
                Descending
              </Button>
              <Button
                variant={dir === "asc" ? "default" : "outline"}
                size="sm"
                onClick={() => onSortChange(sort, "asc")}
                className="gap-2"
              >
                <ArrowUpAZ className="h-4 w-4" />
                Ascending
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
