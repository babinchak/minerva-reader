"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Library, Settings, Home } from "lucide-react";
import { MinervaLogo } from "@/components/minerva-logo";
import { useIsMobile } from "@/lib/use-media-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SiteNavProps {
  rightSlot: React.ReactNode;
}

const navLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/browse", label: "Browse", icon: Library },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function SiteNav({ rightSlot }: SiteNavProps) {
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Defer mobile layout until after mount to avoid hydration mismatch (server has no window).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Close drawer on route change (navigation)
  useEffect(() => {
    closeDrawer();
  }, [pathname, closeDrawer]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeDrawer]);

  // Before mount: render desktop layout so server and client match (avoids hydration error).
  if (!mounted || !isMobile) {
    return (
      <nav className="w-full flex justify-center border-b border-border h-16 shrink-0">
        <div className="w-full max-w-7xl flex justify-between items-center p-3 px-5 text-sm">
          <div className="flex gap-5 items-center font-semibold">
            <Link href="/" className="flex items-center gap-2 text-foreground">
              <MinervaLogo size={28} className="shrink-0" />
              Minerva Reader
            </Link>
            <Link
              href="/browse"
              className={cn(
                "transition-colors",
                pathname.startsWith("/browse")
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Browse
            </Link>
            <Link
              href="/settings"
              className={cn(
                "transition-colors",
                pathname.startsWith("/settings")
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Settings
            </Link>
          </div>
          <div className="flex items-center gap-2">{rightSlot}</div>
        </div>
      </nav>
    );
  }

  // Mobile: compact top bar + slide-out drawer
  return (
    <>
      <nav
        className="w-full flex justify-center border-b border-border h-14 shrink-0 sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="w-full max-w-7xl flex justify-between items-center px-4 text-sm">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold text-foreground shrink-0"
          >
            <MinervaLogo size={24} className="shrink-0" />
            <span className="truncate">Minerva</span>
          </Link>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 -mr-2"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer overlay + panel */}
      <div
        className={cn(
          "fixed inset-0 z-50 transition-opacity duration-200",
          drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        aria-hidden={!drawerOpen}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/40"
          onClick={closeDrawer}
          aria-label="Close menu"
        />

        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-[min(85vw,320px)] max-w-sm bg-background border-r border-border shadow-xl flex flex-col",
            "transition-transform duration-200 ease-out",
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          )}
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
            <span className="font-semibold text-foreground">Menu</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={closeDrawer}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <nav className="flex-1 overflow-auto p-4 flex flex-col gap-1">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const isActive =
                href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={closeDrawer}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {label}
                </Link>
              );
            })}
            <div className="mt-4 pt-4 border-t border-border flex flex-col gap-3">
              {rightSlot}
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
