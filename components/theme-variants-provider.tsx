"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  applyThemeVariantsToDocument,
  clearStoredThemeVariants,
  getStoredThemeVariants,
  normalizeThemeVariants,
  setStoredThemeVariants,
} from "@/lib/theme-variants";

/**
 * Syncs theme variants between localStorage, the document, and the user's
 * Supabase metadata. Anonymous sessions always render the default Minerva
 * theme; logged-in users have their selection rehydrated from server metadata.
 */
export function ThemeVariantsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const supabase = createClient();

    applyThemeVariantsToDocument(getStoredThemeVariants());

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clearStoredThemeVariants();
        return;
      }
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "USER_UPDATED") {
        const metaVariants = session?.user?.user_metadata?.theme_variants;
        if (metaVariants) {
          setStoredThemeVariants(normalizeThemeVariants(metaVariants));
        }
      }
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  return <>{children}</>;
}
