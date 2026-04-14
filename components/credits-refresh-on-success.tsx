"use client";

import { useEffect, useState } from "react";
import { CREDITS_REFRESH_EVENT } from "@/lib/credits-refresh";
import { CheckCircle2, X } from "lucide-react";

/**
 * When user returns from Stripe with ?success=1, dispatch refresh events
 * so credits components refetch (webhook may still be processing).
 * Also shows a confirmation banner.
 */
export function CreditsRefreshOnSuccess() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = window.location.search;
    // Fire Google Ads conversion for new OAuth signups
    if (search.includes("new_signup=true")) {
      if (typeof window.gtag === "function") {
        window.gtag("event", "conversion", {
          send_to: `${process.env.NEXT_PUBLIC_GOOGLE_ADS_ID}/${process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL}`,
        });
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("new_signup");
      window.history.replaceState({}, "", url.pathname + url.search);
    }

    if (!search.includes("success=1")) return;

    // Fire Google Ads conversion for subscription purchase
    if (search.includes("upgrade=1")) {
      if (typeof window.gtag === "function") {
        window.gtag("event", "conversion", {
          send_to: `${process.env.NEXT_PUBLIC_GOOGLE_ADS_ID}/${process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_CONVERSION_LABEL}`,
          value: 10.0,
          currency: "USD",
        });
      }
      setMessage("Welcome to Pro!");
    } else if (search.includes("topup=1")) {
      setMessage("Credits added!");
    }

    const delays = [2000, 4000, 6000];
    const timers = delays.map((ms) =>
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent(CREDITS_REFRESH_EVENT));
      }, ms)
    );

    // Clean up URL params
    const url = new URL(window.location.href);
    url.searchParams.delete("success");
    url.searchParams.delete("upgrade");
    url.searchParams.delete("topup");
    window.history.replaceState({}, "", url.pathname + url.search);

    return () => timers.forEach(clearTimeout);
  }, []);

  if (!message) return null;

  return (
    <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 shadow-lg">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{message}</span>
        <button
          onClick={() => setMessage(null)}
          className="ml-2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
