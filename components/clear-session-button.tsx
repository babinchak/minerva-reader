"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Dev helper: Clears Supabase auth session and refreshes.
 * Use when you need to reset auth state (e.g. stuck session, testing).
 */
export function ClearSessionButton() {
  const router = useRouter();
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    setClearing(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.refresh();
      window.location.href = "/auth/login";
    } finally {
      setClearing(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClear}
      disabled={clearing}
      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
    >
      {clearing ? "Clearing…" : "Clear session"}
    </button>
  );
}
