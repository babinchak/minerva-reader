import { Skeleton } from "@/components/ui/skeleton";

export function ReadPageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Toolbar area */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>
      {/* Content area - mimics reader viewport */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl space-y-6">
          <Skeleton className="mx-auto h-12 w-12 rounded-full" />
          <div className="space-y-2 text-center">
            <Skeleton className="mx-auto h-4 w-32" />
            <Skeleton className="mx-auto h-3 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}
