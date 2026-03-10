"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Palette } from "lucide-react";
import { MinervaLogo } from "@/components/minerva-logo";
import { cn } from "@/lib/utils";

const SETTINGS_NAV = [
  { href: "/settings/usage", label: "Usage", icon: BarChart3 },
  { href: "/settings/theme", label: "Theme", icon: Palette },
] as const;

export function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-48 shrink-0 border-r border-border py-6 pr-4">
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
  );
}
