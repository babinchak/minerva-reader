import { AdminHealth } from "@/components/admin-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminHealthPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Health</h1>
        <p className="text-muted-foreground mt-1">
          Data integrity checks — orphaned records, missing files, broken references
        </p>
      </div>
      <AdminHealth />
    </div>
  );
}
