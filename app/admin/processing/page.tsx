import { AdminProcessingQueue } from "@/components/admin-processing-queue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminProcessingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Processing Queue</h1>
        <p className="text-muted-foreground mt-1">
          EPUBs that failed or are pending readium processing
        </p>
      </div>
      <AdminProcessingQueue />
    </div>
  );
}
