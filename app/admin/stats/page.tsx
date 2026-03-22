import { AdminStats } from "@/components/admin-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminStatsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Stats</h1>
        <p className="text-muted-foreground mt-1">
          System-wide counts and data overview
        </p>
      </div>
      <AdminStats />
    </div>
  );
}
