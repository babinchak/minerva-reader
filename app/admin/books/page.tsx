import { AdminBooksList } from "@/components/admin-books-list";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminBooksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Books</h1>
        <p className="text-muted-foreground mt-1">
          All books in the system with filtering, sorting, and detail views
        </p>
      </div>
      <AdminBooksList />
    </div>
  );
}
