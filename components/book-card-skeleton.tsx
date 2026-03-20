import { Skeleton } from "@/components/ui/skeleton";

export function BookCardSkeleton() {
  return (
    <div className="flex h-full flex-col rounded-lg border bg-card px-3 pt-3 pb-2">
      <div className="relative mb-3 aspect-[2/3] w-full flex-none overflow-hidden rounded-md bg-muted">
        <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
      </div>
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="mt-1 h-3 w-1/2" />
      </div>
      <div className="mt-1 flex h-8 items-center justify-between">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
    </div>
  );
}
