import { Skeleton } from "@/components/ui/skeleton";

function CollectionCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Cover image area (16:9) */}
      <Skeleton className="aspect-[16/9] w-full rounded-none" />
      {/* Text content */}
      <div className="flex flex-col gap-1 p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

export function BrowsePageSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {/* "Curated Library" title */}
          <Skeleton className="h-9 w-48" />
          {/* Description */}
          <Skeleton className="mt-1 h-4 w-80" />
        </div>
        {/* AI assistant button */}
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }).map((_, i) => (
          <CollectionCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
