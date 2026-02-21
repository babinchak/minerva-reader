"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Laptop, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  THEME_VARIANTS,
  getStoredThemeVariants,
  setStoredThemeVariants,
  type ThemeVariantId,
} from "@/lib/theme-variants";
import { ThemeSwatch } from "@/components/theme-swatch";

const MODES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
] as const;

export function ThemeSettingsContent() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const [variants, setVariants] = useState<{ light: ThemeVariantId; dark: ThemeVariantId }>({
    light: "minerva",
    dark: "minerva",
  });

  useEffect(() => {
    setMounted(true);
    setVariants(getStoredThemeVariants());
  }, []);

  const handleVariantChange = (mode: "light" | "dark", id: ThemeVariantId) => {
    const next = { ...variants, [mode]: id };
    setVariants(next);
    setStoredThemeVariants(next);
    setTheme(mode); // Switch to that mode so user sees the change
  };

  if (!mounted) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-foreground mb-2">Mode</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Whether the app uses light or dark colors
        </p>
        <div className="flex flex-wrap gap-2">
          {MODES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                theme === value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground mb-2">Theme palette</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Click a swatch to set the theme for light or dark mode
        </p>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-4 py-3 bg-muted/50 text-sm text-muted-foreground font-medium">
            <span>Theme</span>
            <span className="flex items-center gap-1.5">
              <Sun className="h-4 w-4" />
              Light
            </span>
            <span className="flex items-center gap-1.5">
              <Moon className="h-4 w-4" />
              Dark
            </span>
          </div>
          {THEME_VARIANTS.map(({ id, name, description }) => (
            <div
              key={id}
              className="grid grid-cols-[1fr_auto_auto] gap-4 items-center px-4 py-3 border-t border-border hover:bg-accent/30 transition-colors"
            >
              <div>
                <p className="font-medium text-foreground">{name}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <button
                type="button"
                onClick={() => handleVariantChange("light", id)}
                className="rounded-md p-0.5 transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                aria-label={`Set ${name} as light mode theme`}
              >
                <ThemeSwatch themeId={id} mode="light" selected={variants.light === id} />
              </button>
              <button
                type="button"
                onClick={() => handleVariantChange("dark", id)}
                className="rounded-md p-0.5 transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                aria-label={`Set ${name} as dark mode theme`}
              >
                <ThemeSwatch themeId={id} mode="dark" selected={variants.dark === id} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
