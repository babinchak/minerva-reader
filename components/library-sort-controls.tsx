"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  BookOpen,
  Calendar,
  ChevronDown,
  FileText,
} from "lucide-react";

export type LibrarySortType = "dateAdded" | "title";
export type LibrarySortDir = "asc" | "desc";
export type LibraryBookFilter = "all" | "epub" | "pdf";

const SORT_TYPE_OPTIONS: { value: LibrarySortType; label: string; icon: React.ReactNode }[] = [
  { value: "dateAdded", label: "Date added", icon: <Calendar className="h-4 w-4" /> },
  { value: "title", label: "Title", icon: <ArrowDownAZ className="h-4 w-4" /> },
];

const FILTER_OPTIONS: { value: LibraryBookFilter; label: string; icon?: React.ReactNode }[] = [
  { value: "all", label: "All" },
  { value: "epub", label: "EPUB only", icon: <BookOpen className="h-4 w-4" /> },
  { value: "pdf", label: "PDF only", icon: <FileText className="h-4 w-4" /> },
];

function OptionDropdown<T extends string>({
  options,
  value,
  onSelect,
  "aria-label": ariaLabel,
}: {
  options: { value: T; label: string; icon: React.ReactNode }[];
  value: T;
  onSelect: (value: T) => void;
  "aria-label": string;
}) {
  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={ariaLabel}
          className="inline-flex items-center gap-2 border-input bg-background"
        >
          {current.icon}
          <span className="hidden sm:inline">{current.label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onSelect(option.value)}
            className={option.value === value ? "bg-accent" : ""}
          >
            {option.icon}
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterToggleGroup({
  value,
  onSelect,
}: {
  value: LibraryBookFilter;
  onSelect: (value: LibraryBookFilter) => void;
}) {
  return (
    <div
      className="inline-flex h-8 items-stretch overflow-hidden rounded-md border border-input bg-background"
      role="group"
      aria-label="Filter books"
    >
      {FILTER_OPTIONS.map((option) => {
        const isActive = option.value === value;
        return (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelect(option.value)}
            aria-pressed={isActive}
            className={
              isActive
                ? "h-full rounded-none gap-1.5 border-0 bg-accent px-3 text-accent-foreground shadow-none hover:bg-accent"
                : "h-full rounded-none gap-1.5 border-0 px-3 text-muted-foreground shadow-none hover:text-foreground"
            }
          >
            {option.icon}
            <span>{option.label}</span>
          </Button>
        );
      })}
    </div>
  );
}

export function LibrarySortControls({
  sort = "dateAdded",
  dir = "desc",
  filter = "all",
  onSortChange,
  onFilterChange,
}: {
  sort?: LibrarySortType;
  dir?: LibrarySortDir;
  filter?: LibraryBookFilter;
  /** When provided, uses callback instead of URL - for instant in-memory sorting */
  onSortChange?: (sort: LibrarySortType, dir: LibrarySortDir) => void;
  onFilterChange?: (filter: LibraryBookFilter) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParams = (updates: {
    sort?: LibrarySortType;
    dir?: LibrarySortDir;
    filter?: LibraryBookFilter;
  }) => {
    if (onSortChange || onFilterChange) {
      const newSort = updates.sort ?? sort;
      const newDir = updates.dir ?? dir;
      const newFilter = updates.filter ?? filter;
      onSortChange?.(newSort, newDir);
      onFilterChange?.(newFilter);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (updates.sort !== undefined) params.set("sort", updates.sort);
    if (updates.dir !== undefined) params.set("dir", updates.dir);
    if (updates.filter !== undefined) params.set("filter", updates.filter);
    router.push(`/?${params.toString()}`);
  };

  const toggleDir = () => updateParams({ dir: dir === "asc" ? "desc" : "asc" });

  return (
    <div className="flex items-center gap-2">
      <FilterToggleGroup value={filter} onSelect={(v) => updateParams({ filter: v })} />
      <OptionDropdown
        options={SORT_TYPE_OPTIONS}
        value={sort}
        onSelect={(v) => updateParams({ sort: v })}
        aria-label="Sort by"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={toggleDir}
        aria-label={dir === "asc" ? "Ascending – click to switch to descending" : "Descending – click to switch to ascending"}
        className="inline-flex items-center gap-2 border-input bg-background"
        title={dir === "asc" ? "Ascending (click to toggle)" : "Descending (click to toggle)"}
      >
        {dir === "asc" ? (
          <ArrowUpAZ className="h-4 w-4" />
        ) : (
          <ArrowDownAZ className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">{dir === "asc" ? "Asc" : "Desc"}</span>
      </Button>
    </div>
  );
}
