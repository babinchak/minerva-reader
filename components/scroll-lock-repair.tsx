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

function setScrollUnlockClass(pathname: string) {
  if (typeof document === "undefined") return;
  const isReaderRoute = pathname.startsWith("/read/");
  const unlock = !isReaderRoute;
  document.body.classList.toggle("scroll-unlock", unlock);
  document.documentElement.classList.toggle("scroll-unlock", unlock);
}

/**
 * Repairs stray scroll lock when navigating away from reader pages.
 * Reader components may set overflow:hidden, position:fixed, etc. on body/html.
 * If the user navigates back before cleanup runs, the lock can persist.
 * On home/browse we also add a CSS class that forces scrollability as fallback.
 */
export function ScrollLockRepair() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    clearScrollLock();
    setScrollUnlockClass(pathname);

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        clearScrollLock();
        setScrollUnlockClass(window.location.pathname);
      }
    };
    const onPopState = () => {
      clearScrollLock();
      setScrollUnlockClass(window.location.pathname);
    };
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("popstate", onPopState);
    };
  }, [pathname]);

  return null;
}
