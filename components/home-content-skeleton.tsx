import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton fallback for the landing page HomeContent Suspense boundary.
 * Mirrors the signed-out layout: headline + search bar + CTA + feature pills + response wall.
 * For signed-in users, the LibraryPageSkeleton is used instead (separate Suspense).
 */
export function HomeContentSkeleton() {
  return (
    <div className="w-full max-w-7xl space-y-5 sm:space-y-6">
      {/* Rotating headline placeholder */}
      <section className="flex flex-col items-center pt-2 sm:pt-4">
        <div className="h-[4rem] sm:h-[2.5rem] flex items-center">
          <Skeleton className="h-8 w-72 sm:w-96" />
        </div>

        {/* Search bar */}
        <div className="mt-4 w-full max-w-3xl mx-auto">
          <Skeleton className="h-[56px] w-full rounded-2xl" />
        </div>

        {/* CTA button */}
        <Skeleton className="mt-4 h-12 w-64 rounded-xl" />
      </section>

      {/* Feature pills */}
      <section className="w-full max-w-7xl space-y-6">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>

        {/* Response wall cards area */}
        <div className="relative overflow-hidden" style={{ minHeight: 480 }}>
          <div className="flex gap-4 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-[420px] w-[340px] shrink-0 rounded-xl"
              />
            ))}
          </div>
        </div>
      </section>

      {/* HeroReplay placeholder */}
      <section className="w-full">
        <Skeleton className="h-[400px] w-full rounded-2xl" />
      </section>
    </div>
  );
}
