"use client";

import { useEffect } from "react";
import { CREDITS_REFRESH_EVENT } from "@/lib/credits-refresh";

/**
 * When user returns from Stripe with ?success=1, dispatch refresh events
 * so credits components refetch (webhook may still be processing).
 */
export function CreditsRefreshOnSuccess() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = window.location.search;
    if (!search.includes("success=1")) return;

    const delays = [2000, 4000, 6000];
    const timers = delays.map((ms) =>
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent(CREDITS_REFRESH_EVENT));
      }, ms)
    );
    return () => timers.forEach(clearTimeout);
  }, []);
  return null;
}
