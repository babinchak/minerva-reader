"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Palette, User } from "lucide-react";
import { MinervaLogo } from "@/components/minerva-logo";
import { cn } from "@/lib/utils";

const SETTINGS_NAV = [
  { href: "/settings/profile", label: "Profile", icon: User },
  { href: "/settings/usage", label: "Usage", icon: BarChart3 },
  { href: "/settings/theme", label: "Theme", icon: Palette },
] as const;

export function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile: horizontal scrollable nav */}
      <nav className="flex md:hidden gap-1 overflow-x-auto border-b border-border px-4 py-2 scrollbar-none">
        {SETTINGS_NAV.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Desktop: vertical sidebar */}
      <aside className="hidden md:block w-48 shrink-0 border-r border-border py-6 pr-4">
        <Link href="/" className="mb-6 flex items-center gap-2 px-3">
          <MinervaLogo size={28} />
          <span className="text-sm font-semibold text-foreground">Minerva</span>
        </Link>
        <nav className="flex flex-col gap-1">
          {SETTINGS_NAV.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
