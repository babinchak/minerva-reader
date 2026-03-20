import { UsageContentSkeleton } from "@/components/usage-content-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function UsageSettingsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <UsageContentSkeleton />
    </div>
  );
}
