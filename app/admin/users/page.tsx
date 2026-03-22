import { AdminUsersList } from "@/components/admin-users-list";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="text-muted-foreground mt-1">
          All registered users with activity and usage stats
        </p>
      </div>
      <AdminUsersList />
    </div>
  );
}
