import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { ServerSiteNav } from "@/components/server-site-nav";
import { SiteFooter } from "@/components/site-footer";
import { hasEnvVars } from "@/lib/utils";
import { EnvVarWarning } from "@/components/env-var-warning";
import { Suspense } from "react";
import { AdminSidebar } from "@/components/admin-sidebar";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
      <ServerSiteNav
        rightSlot={
          <>
            {!hasEnvVars ? (
              <EnvVarWarning />
            ) : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
            <ThemeSwitcher />
          </>
        }
      />

      <div className="flex-1 flex min-h-0 w-full max-w-5xl mx-auto self-center">
        <AdminSidebar />
        <div className="flex-1 min-w-0 p-6 overflow-auto">
          {children}
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
