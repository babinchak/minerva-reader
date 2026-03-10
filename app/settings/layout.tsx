import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SiteNav } from "@/components/site-nav";
import { hasEnvVars } from "@/lib/utils";
import { EnvVarWarning } from "@/components/env-var-warning";
import { Suspense } from "react";
import { SettingsSidebar } from "@/components/settings-sidebar";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col text-foreground">
      <SiteNav
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
        <SettingsSidebar />
        <div className="flex-1 min-w-0 p-6 overflow-auto">
          {children}
        </div>
      </div>
    </main>
  );
}
