import { AdminCollectionsList } from "@/components/admin-collections-list";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminCollectionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Curated Collections</h1>
        <p className="text-muted-foreground mt-1">
          Manage curated collections visible to all users on the browse page
        </p>
      </div>
      <AdminCollectionsList />
    </div>
  );
}
