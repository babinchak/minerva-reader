"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, Users, BarChart3, HeartPulse, Activity, DollarSign } from "lucide-react";
import { MinervaLogo } from "@/components/minerva-logo";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/books", label: "Books", icon: BookOpen },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/billing", label: "Billing", icon: DollarSign },
  { href: "/admin/activity", label: "Activity", icon: Activity },
  { href: "/admin/stats", label: "Stats", icon: BarChart3 },
  { href: "/admin/health", label: "Health", icon: HeartPulse },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-48 shrink-0 border-r border-border py-6 pr-4">
      <Link href="/" className="mb-6 flex items-center gap-2 px-3">
        <MinervaLogo size={28} />
        <span className="text-sm font-semibold text-foreground">Admin</span>
      </Link>
      <nav className="flex flex-col gap-1">
        {ADMIN_NAV.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
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
