"use client";

import { useEffect } from "react";
import {
  getStoredThemeVariants,
  setStoredThemeVariants,
  type ThemeVariantId,
} from "@/lib/theme-variants";

/**
 * Applies stored theme variants to document.documentElement.
 * Runs on mount to sync React state with DOM (e.g. after navigation).
 */
export function ThemeVariantsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const { light, dark } = getStoredThemeVariants();
    document.documentElement.setAttribute("data-light-theme", light);
    document.documentElement.setAttribute("data-dark-theme", dark);
  }, []);

  return <>{children}</>;
}
