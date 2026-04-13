import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Skeleton } from "@/components/ui/skeleton";
import { BookCardSkeleton } from "@/components/book-card-skeleton";

export default function BrowseCollectionLoading() {
  return (
    <main className="min-h-screen flex flex-col items-center text-foreground">
      <div className="flex-1 w-full flex flex-col gap-4 items-center">
        <SiteNav
          rightSlot={
            <div className="flex gap-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-16" />
            </div>
          }
        />
        <div className="flex-1 w-full flex flex-col gap-6 max-w-7xl px-6 pt-2 pb-8 items-center">
          <div className="w-full max-w-7xl space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {/* Back link */}
                <Skeleton className="h-4 w-28" />
                {/* Collection title */}
                <Skeleton className="mt-1 h-9 w-56" />
                {/* Description */}
                <Skeleton className="mt-1 h-4 w-80" />
              </div>
              {/* AI button */}
              <Skeleton className="h-9 w-9 rounded-md" />
            </div>
            {/* Search input */}
            <Skeleton className="h-9 w-48 rounded-md" />
            {/* Book grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <BookCardSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>
        <SiteFooter className="py-16" />
      </div>
    </main>
  );
}
