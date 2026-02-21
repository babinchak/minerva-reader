"use client";

import { getPreviewColors, type ThemeVariantId } from "@/lib/theme-variants";
import { cn } from "@/lib/utils";

interface ThemeSwatchProps {
  themeId: ThemeVariantId;
  mode: "light" | "dark";
  selected?: boolean;
  className?: string;
}

export function ThemeSwatch({ themeId, mode, selected, className }: ThemeSwatchProps) {
  const colors = getPreviewColors(themeId, mode);

  return (
    <div
      className={cn(
        "rounded-md overflow-hidden border shrink-0",
        selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border",
        className
      )}
      style={{ width: 48, height: 32 }}
    >
      <div className="h-full w-full flex">
        <div className="flex-1" style={{ backgroundColor: colors.bg }} />
        <div className="w-2" style={{ backgroundColor: colors.accent }} />
        <div className="w-2" style={{ backgroundColor: colors.primary }} />
      </div>
    </div>
  );
}
