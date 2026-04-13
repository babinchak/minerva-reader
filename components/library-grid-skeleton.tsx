import { Skeleton } from "@/components/ui/skeleton";
import { BookCardSkeleton } from "@/components/book-card-skeleton";

const DEFAULT_CARD_COUNT = 12;

export function LibraryGridSkeleton({ count = DEFAULT_CARD_COUNT }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <BookCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function LibraryPageSkeleton() {
  return (
    <div className="w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {/* "Library" title */}
          <Skeleton className="h-9 w-24" />
          {/* Books / Collections toggle */}
          <Skeleton className="h-8 w-36 rounded-md" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Sort controls */}
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
          {/* Upload button */}
          <Skeleton className="h-9 w-9 rounded-md" />
          {/* AI assistant button */}
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>
      {/* Search input */}
      <Skeleton className="h-9 w-full max-w-sm rounded-md" />
      <LibraryGridSkeleton />
    </div>
  );
}
