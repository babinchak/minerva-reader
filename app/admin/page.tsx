import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { AdminBooksList } from "@/components/admin-books-list";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/login");
  }
  if (!isAdminEmail(user.email)) {
    redirect("/");
  }

  return (
    <main className="min-h-screen flex flex-col text-foreground">
      <nav className="w-full flex justify-center border-b border-border h-16 shrink-0">
        <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
          <div className="flex gap-5 items-center font-semibold">
            <Link href="/" className="flex items-center gap-2 text-foreground">
              <BookOpen className="h-5 w-5" />
              Minerva Reader
            </Link>
            <Link href="/browse" className="text-muted-foreground hover:text-foreground transition-colors">
              Browse
            </Link>
            <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">
              Settings
            </Link>
            <Link href="/admin" className="text-foreground">
              Admin
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <AuthButton />
            <ThemeSwitcher />
          </div>
        </div>
      </nav>

      <div className="flex-1 w-full max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Admin — Books</h1>
        <AdminBooksList />
      </div>
    </main>
  );
}
