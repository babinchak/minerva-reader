"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

const LOCK_PROPS = [
  "overflow",
  "overflowX",
  "overflowY",
  "margin-top",
  "marginTop",
  "position",
  "padding-right",
  "paddingRight",
] as const;

function clearScrollLock() {
  if (typeof document === "undefined") return;
  for (const p of LOCK_PROPS) {
    document.body.style.removeProperty(p);
    document.documentElement.style.removeProperty(p);
  }
}

/**
 * Repairs stray scroll lock when navigating away from Thorium reader pages.
 * Thorium sets overflow:hidden, position:fixed, etc. on body/html.
 * If the user navigates back before cleanup runs, the lock can persist.
 *
 * Only applies the scroll-unlock class on non-reader routes AND only when
 * navigating away from a reader route (to clean up Thorium's styles).
 * This avoids permanently fighting Radix modal scroll-lock on normal pages.
 */
export function ScrollLockRepair() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const isReaderRoute = pathname.startsWith("/read/");

    if (!isReaderRoute) {
      // Clear any stray inline styles Thorium may have left behind
      clearScrollLock();
      // Temporarily add scroll-unlock to force override Thorium CSS,
      // then remove it so it doesn't interfere with Radix modals
      document.body.classList.add("scroll-unlock");
      document.documentElement.classList.add("scroll-unlock");

      // Remove the class after a frame — Thorium's styles are inline so
      // clearScrollLock() already handled them; the class is just a safety net
      // for any Thorium CSS rules that target body. Once cleared, remove it
      // so Radix Dialog can manage scroll-lock normally.
      const raf = requestAnimationFrame(() => {
        document.body.classList.remove("scroll-unlock");
        document.documentElement.classList.remove("scroll-unlock");
      });

      return () => cancelAnimationFrame(raf);
    }
  }, [pathname]);

  useLayoutEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) clearScrollLock();
    };
    const onPopState = () => clearScrollLock();

    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return null;
}
