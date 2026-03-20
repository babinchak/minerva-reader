import { Skeleton } from "@/components/ui/skeleton";
import { BookCardSkeleton } from "@/components/book-card-skeleton";

/** Neutral skeleton for HomeContent fallback. Works for both hero (signed-out) and library (signed-in) layouts. */
export function HomeContentSkeleton() {
  return (
    <div className="w-full max-w-7xl space-y-12 sm:space-y-14">
      {/* Top section - matches hero dimensions (rounded card, full width) */}
      <section className="w-full rounded-[2rem] border border-border/70 bg-gradient-to-br from-background via-background to-muted/35 px-4 py-6 shadow-sm sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:items-center">
          <div className="space-y-6 text-left">
            <div className="mb-2 flex justify-center">
              <Skeleton className="aspect-square w-64 sm:w-72 lg:w-80 rounded-lg" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-12 w-full max-w-xl sm:h-14" />
              <Skeleton className="h-10 w-4/5 max-w-lg" />
              <Skeleton className="h-5 w-full max-w-xl" />
              <Skeleton className="h-5 w-3/4 max-w-md" />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Skeleton className="h-10 w-36" />
              <Skeleton className="h-9 w-24" />
            </div>
            <Skeleton className="h-4 w-full max-w-lg" />
          </div>
          <div className="hidden lg:block">
            <Skeleton className="aspect-video w-full rounded-lg" />
          </div>
        </div>
      </section>
      {/* Content grid - both hero and library use a card grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <BookCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
