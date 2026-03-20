import { Skeleton } from "@/components/ui/skeleton";
import { BookCardSkeleton } from "@/components/book-card-skeleton";

const DEFAULT_CARD_COUNT = 12;

export function BrowsePageSkeleton({ count = DEFAULT_CARD_COUNT }: { count?: number }) {
  return (
    <div className="w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: count }).map((_, i) => (
          <BookCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
