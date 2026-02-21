"use client";

import { useEffect, useState, useCallback } from "react";
import { Coins } from "lucide-react";
import Link from "next/link";
import { CREDITS_REFRESH_EVENT } from "@/lib/credits-refresh";

interface CreditsInfo {
  tier: string;
  balance: number;
  monthlyAllowance: number;
  booksUploadedThisWeek: number;
  booksUploadLimit: number;
  agenticToday: number;
  agenticLimit: number;
}

export function CreditsDisplay() {
  const [info, setInfo] = useState<CreditsInfo | null>(null);

  const fetchCredits = useCallback(() => {
    fetch(`/api/credits?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  useEffect(() => {
    const handler = () => fetchCredits();
    window.addEventListener(CREDITS_REFRESH_EVENT, handler);
    return () => window.removeEventListener(CREDITS_REFRESH_EVENT, handler);
  }, [fetchCredits]);

  if (!info || info.tier === "anonymous") return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Coins className="h-4 w-4" aria-hidden />
        <span>{info.balance.toLocaleString()} credits</span>
      </span>
      {info.tier === "free" && (
        <Link
          href="/?upgrade=1"
          className="text-primary hover:underline">
          Upgrade
        </Link>
      )}
      {info.tier === "paid" && (
        <Link
          href="/settings/usage"
          className="text-primary hover:underline">
          Usage
        </Link>
      )}
    </div>
  );
}
