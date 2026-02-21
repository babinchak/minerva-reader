import Link from "next/link";
import { BookOpen } from "lucide-react";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
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
            <Link href="/settings" className="text-foreground">
              Settings
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {!hasEnvVars ? (
              <EnvVarWarning />
            ) : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
            <ThemeSwitcher />
          </div>
        </div>
      </nav>

      <div className="flex-1 flex min-h-0 w-full max-w-5xl mx-auto self-center">
        <SettingsSidebar />
        <div className="flex-1 min-w-0 p-6 overflow-auto">
          {children}
        </div>
      </div>
    </main>
  );
}
