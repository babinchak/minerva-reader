"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, Library, Home, Shield, Settings, LogOut, Sun, Moon, Laptop } from "lucide-react";
import { useIsMobile } from "@/lib/use-media-query";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { MinervaLogo } from "@/components/minerva-logo";
import { UserMenu } from "@/components/user-menu";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface SiteNavProps {
  rightSlot: React.ReactNode;
  showAdmin?: boolean;
  userInfo?: {
    email: string;
    displayName: string;
    avatarUrl?: string;
  };
}

function emailToColor(email: string) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash >> 0) & 0xff) * 1.41;
  return `hsl(${hue}, 55%, 45%)`;
}

const navLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/browse", label: "Explore", icon: Library },
] as const;

const adminLink = { href: "/admin", label: "Admin", icon: Shield } as const;

export function SiteNav({ rightSlot, showAdmin, userInfo }: SiteNavProps) {
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    closeDrawer();
  }, [pathname, closeDrawer]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeDrawer]);

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  // Before mount: render desktop layout so server and client match.
  if (!mounted || !isMobile) {
    return (
      <nav className="w-full flex justify-center border-b border-border h-16 shrink-0">
        <div className="w-full max-w-7xl flex justify-between items-center p-3 px-5 text-sm">
          <div className="flex gap-5 items-center font-semibold">
            <Link href="/" className="flex items-center gap-2 text-foreground">
              <MinervaLogo size={24} />
              Minerva Reader
            </Link>
            {navLinks.filter((l) => l.href !== "/").map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "transition-colors",
                  pathname.startsWith(href)
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </Link>
            ))}
            {showAdmin && (
              <Link
                href="/admin"
                className={cn(
                  "transition-colors",
                  pathname.startsWith("/admin")
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Admin
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2">{rightSlot}</div>
        </div>
      </nav>
    );
  }

  // Mobile: compact top bar + slide-out drawer
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Laptop;

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
            <MinervaLogo size={22} />
            Minerva Reader
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
            {userInfo ? (
              <div className="flex items-center gap-3 min-w-0">
                {userInfo.avatarUrl ? (
                  <img
                    src={userInfo.avatarUrl}
                    alt=""
                    className="h-8 w-8 min-w-8 shrink-0 rounded-full"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    className="flex h-8 w-8 min-w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium"
                    style={{ backgroundColor: emailToColor(userInfo.email), color: "#fff" }}
                  >
                    {userInfo.email[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {userInfo.displayName}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {userInfo.email}
                  </div>
                </div>
              </div>
            ) : (
              <span className="font-semibold text-foreground">Menu</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={closeDrawer}
              aria-label="Close menu"
              className="shrink-0"
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
            {showAdmin && (
              <Link
                key={adminLink.href}
                href={adminLink.href}
                onClick={closeDrawer}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-medium transition-colors",
                  pathname.startsWith(adminLink.href)
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <adminLink.icon className="h-5 w-5 shrink-0" />
                {adminLink.label}
              </Link>
            )}

            {userInfo && (
              <div className="mt-4 pt-4 border-t border-border flex flex-col gap-1">
                <Link
                  href="/settings"
                  onClick={closeDrawer}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-medium transition-colors",
                    pathname.startsWith("/settings")
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <Settings className="h-5 w-5 shrink-0" />
                  Settings
                </Link>
                <button
                  onClick={() => { closeDrawer(); logout(); }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors w-full text-left"
                >
                  <LogOut className="h-5 w-5 shrink-0" />
                  Log out
                </button>
              </div>
            )}

            {!userInfo && (
              <div className="mt-4 pt-4 border-t border-border flex flex-col gap-3">
                {rightSlot}
              </div>
            )}

            <div className="mt-auto pt-4 pb-2 flex justify-center">
              <div className="flex rounded-lg border border-border p-0.5">
                {([
                  { value: "light", icon: Sun },
                  { value: "dark", icon: Moon },
                  { value: "system", icon: Laptop },
                ] as const).map(({ value, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className={cn(
                      "rounded-md p-1.5 transition-colors",
                      theme === value
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
