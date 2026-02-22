export type ThemeVariantId =
  | "minerva"
  | "sepia"
  | "forest"
  | "violet"
  | "ocean"
  | "ember"
  | "desert"
  | "noir"
  | "solarized"
  | "nord"
  | "meadow"
  | "champagne"
  | "indigo"
  | "steampunk"
  | "neon"
  | "nebula"
  | "obsidian"
  | "gothic"
  | "inferno"
  | "cyberpunk";

/** HSL string for inline styles: "hsl(H, S%, L%)" */
function hsl(h: number, s: number, l: number) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/** Preview colors for theme swatches - matches globals.css */
const PREVIEW_COLORS: Record<
  ThemeVariantId,
  { light: { bg: string; primary: string; accent: string }; dark: { bg: string; primary: string; accent: string } }
> = {
  minerva: {
    light: { bg: hsl(35, 25, 97), primary: hsl(85, 25, 35), accent: hsl(35, 18, 90) },
    dark: { bg: hsl(25, 15, 8), primary: hsl(38, 80, 55), accent: hsl(25, 12, 18) },
  },
  sepia: {
    light: { bg: hsl(35, 30, 94), primary: hsl(30, 45, 35), accent: hsl(35, 22, 86) },
    dark: { bg: hsl(30, 20, 8), primary: hsl(38, 60, 52), accent: hsl(30, 12, 18) },
  },
  forest: {
    light: { bg: hsl(120, 15, 97), primary: hsl(140, 30, 32), accent: hsl(120, 15, 90) },
    dark: { bg: hsl(140, 20, 7), primary: hsl(150, 55, 45), accent: hsl(140, 12, 16) },
  },
  violet: {
    light: { bg: hsl(270, 20, 97), primary: hsl(270, 45, 42), accent: hsl(270, 25, 92) },
    dark: { bg: hsl(270, 25, 8), primary: hsl(270, 65, 65), accent: hsl(270, 20, 18) },
  },
  ocean: {
    light: { bg: hsl(210, 25, 97), primary: hsl(210, 50, 38), accent: hsl(210, 20, 90) },
    dark: { bg: hsl(220, 25, 8), primary: hsl(200, 70, 52), accent: hsl(220, 18, 18) },
  },
  ember: {
    light: { bg: hsl(20, 25, 97), primary: hsl(10, 65, 42), accent: hsl(20, 30, 92) },
    dark: { bg: hsl(10, 25, 8), primary: hsl(15, 75, 55), accent: hsl(10, 20, 18) },
  },
  desert: {
    light: { bg: hsl(35, 40, 94), primary: hsl(25, 55, 42), accent: hsl(35, 35, 90) },
    dark: { bg: hsl(25, 30, 8), primary: hsl(25, 50, 55), accent: hsl(25, 25, 18) },
  },
  noir: {
    light: { bg: hsl(0, 0, 98), primary: hsl(0, 0, 15), accent: hsl(0, 0, 92) },
    dark: { bg: hsl(0, 0, 6), primary: hsl(0, 0, 95), accent: hsl(0, 0, 18) },
  },
  solarized: {
    light: { bg: hsl(43, 85, 95), primary: hsl(207, 70, 50), accent: hsl(175, 65, 88) },
    dark: { bg: hsl(193, 100, 11), primary: hsl(175, 65, 40), accent: hsl(193, 50, 22) },
  },
  nord: {
    light: { bg: hsl(220, 16, 96), primary: hsl(215, 50, 45), accent: hsl(210, 40, 90) },
    dark: { bg: hsl(220, 16, 22), primary: hsl(210, 40, 60), accent: hsl(220, 14, 28) },
  },
  meadow: {
    light: { bg: hsl(120, 25, 97), primary: hsl(140, 35, 35), accent: hsl(100, 30, 92) },
    dark: { bg: hsl(140, 25, 8), primary: hsl(140, 50, 50), accent: hsl(140, 20, 18) },
  },
  champagne: {
    light: { bg: hsl(45, 35, 97), primary: hsl(40, 35, 45), accent: hsl(45, 25, 92) },
    dark: { bg: hsl(40, 25, 8), primary: hsl(45, 60, 55), accent: hsl(40, 20, 18) },
  },
  indigo: {
    light: { bg: hsl(250, 25, 97), primary: hsl(250, 45, 45), accent: hsl(250, 20, 92) },
    dark: { bg: hsl(250, 35, 8), primary: hsl(250, 55, 65), accent: hsl(250, 25, 18) },
  },
  steampunk: {
    light: { bg: hsl(35, 35, 94), primary: hsl(30, 40, 38), accent: hsl(25, 30, 88) },
    dark: { bg: hsl(25, 25, 8), primary: hsl(35, 55, 52), accent: hsl(25, 20, 18) },
  },
  neon: {
    light: { bg: hsl(280, 15, 97), primary: hsl(320, 90, 55), accent: hsl(190, 90, 92) },
    dark: { bg: hsl(280, 30, 6), primary: hsl(320, 100, 60), accent: hsl(190, 90, 25) },
  },
  nebula: {
    light: { bg: hsl(290, 30, 96), primary: hsl(290, 50, 48), accent: hsl(320, 40, 92) },
    dark: { bg: hsl(290, 40, 8), primary: hsl(320, 65, 65), accent: hsl(290, 35, 20) },
  },
  obsidian: {
    light: { bg: hsl(220, 10, 96), primary: hsl(220, 15, 25), accent: hsl(220, 8, 90) },
    dark: { bg: hsl(0, 0, 4), primary: hsl(0, 0, 90), accent: hsl(0, 0, 12) },
  },
  gothic: {
    light: { bg: hsl(270, 15, 96), primary: hsl(270, 30, 25), accent: hsl(270, 12, 90) },
    dark: { bg: hsl(270, 25, 6), primary: hsl(330, 50, 55), accent: hsl(270, 20, 16) },
  },
  inferno: {
    light: { bg: hsl(25, 40, 96), primary: hsl(15, 85, 45), accent: hsl(30, 60, 92) },
    dark: { bg: hsl(10, 50, 6), primary: hsl(25, 95, 55), accent: hsl(15, 60, 20) },
  },
  cyberpunk: {
    light: { bg: hsl(220, 12, 97), primary: hsl(180, 75, 42), accent: hsl(300, 60, 92) },
    dark: { bg: hsl(260, 20, 6), primary: hsl(180, 90, 55), accent: hsl(300, 80, 25) },
  },
};

export function getPreviewColors(id: ThemeVariantId, mode: "light" | "dark") {
  return PREVIEW_COLORS[id][mode];
}

/** Convert CSS variable value "H S% L%" to "hsl(H, S%, L%)" */
function cssVarToHsl(value: string): string {
  const t = value.trim();
  if (!t) return "";
  const parts = t.split(/\s+/);
  if (parts.length < 3) return "";
  return `hsl(${parts[0]}, ${parts[1]}, ${parts[2]})`;
}

/** Build Thorium theme tokens from PREVIEW_COLORS (no DOM reads) */
function buildTokensFromPreview(
  id: ThemeVariantId,
  mode: "light" | "dark"
): Record<string, string> {
  const { bg, primary, accent } = PREVIEW_COLORS[id][mode];
  const isLight = mode === "light";
  const text = isLight ? "hsl(25, 10%, 12%)" : "hsl(40, 15%, 95%)";
  const subdue = isLight ? "hsl(25, 10%, 45%)" : "hsl(40, 10%, 65%)";
  return {
    background: bg,
    text,
    link: isLight ? "#0000ee" : "#63caff",
    visited: isLight ? "#551a8b" : "#0099e5",
    subdue,
    disable: "#808080",
    hover: accent,
    onHover: text,
    select: "#b4d8fe",
    onSelect: "inherit",
    focus: "#0067f4",
    elevate: "0px 0px 2px #808080",
    immerse: isLight ? "0.6" : "0.4",
  };
}

/**
 * Get Thorium theme tokens for the user's selected theme variants.
 * Uses stored variant IDs - no DOM manipulation.
 */
export function getThoriumThemeFromStoredVariants(): {
  light: Record<string, string>;
  dark: Record<string, string>;
} | null {
  if (typeof window === "undefined") return null;
  const { light: lightId, dark: darkId } = getStoredThemeVariants();
  return {
    light: buildTokensFromPreview(lightId, "light"),
    dark: buildTokensFromPreview(darkId, "dark"),
  };
}

/**
 * Read current theme colors from document (respects theme variant + light/dark).
 * Falls back to stored variants if document read fails.
 */
export function getThoriumThemeFromDocument(): {
  light: Record<string, string>;
  dark: Record<string, string>;
} | null {
  const fromStored = getThoriumThemeFromStoredVariants();
  if (typeof document === "undefined") return fromStored;
  const root = document.documentElement;
  const style = getComputedStyle(root);

  const buildTokens = (bg: string, fg: string, accent: string, mutedFg: string, isLight: boolean) => ({
    background: cssVarToHsl(bg),
    text: cssVarToHsl(fg),
    link: isLight ? "#0000ee" : "#63caff",
    visited: isLight ? "#551a8b" : "#0099e5",
    subdue: cssVarToHsl(mutedFg) || "#808080",
    disable: "#808080",
    hover: cssVarToHsl(accent),
    onHover: cssVarToHsl(fg),
    select: "#b4d8fe",
    onSelect: "inherit" as const,
    focus: "#0067f4",
    elevate: "0px 0px 2px #808080",
    immerse: isLight ? "0.6" : "0.4",
  });

  const lightBg = style.getPropertyValue("--background").trim();
  const lightFg = style.getPropertyValue("--foreground").trim();
  const lightAccent = style.getPropertyValue("--accent").trim();
  const lightMuted = style.getPropertyValue("--muted-foreground").trim();
  if (!lightBg || !lightFg) return fromStored;
  const lightTokens = buildTokens(lightBg, lightFg, lightAccent, lightMuted, true);

  const hadDark = root.classList.contains("dark");
  root.classList.add("dark");
  const darkStyle = getComputedStyle(root);
  const darkBg = darkStyle.getPropertyValue("--background").trim();
  const darkFg = darkStyle.getPropertyValue("--foreground").trim();
  const darkAccent = darkStyle.getPropertyValue("--accent").trim();
  const darkMuted = darkStyle.getPropertyValue("--muted-foreground").trim();
  if (!hadDark) root.classList.remove("dark");

  const darkTokens =
    darkBg && darkFg
      ? buildTokens(darkBg, darkFg, darkAccent, darkMuted, false)
      : lightTokens;

  return { light: lightTokens, dark: darkTokens };
}

/**
 * Theme variant IDs. Each light theme has a paired dark theme with the same id.
 */
export const THEME_VARIANTS = [
  { id: "minerva", name: "Minerva", description: "Warm parchment and amber" },
  { id: "sepia", name: "Sepia", description: "Classic reading tones" },
  { id: "forest", name: "Forest", description: "Soft green and woodland" },
  { id: "violet", name: "Violet", description: "Purple and lavender" },
  { id: "ocean", name: "Ocean", description: "Soft blue and deep sea" },
  { id: "ember", name: "Ember", description: "Warm red and coral" },
  { id: "desert", name: "Desert", description: "Warm sand and terracotta" },
  { id: "noir", name: "Noir", description: "High contrast black and white" },
  { id: "solarized", name: "Solarized", description: "Amber and blue palette" },
  { id: "nord", name: "Nord", description: "Cool Nordic blues" },
  { id: "meadow", name: "Meadow", description: "Soft greens and wildflowers" },
  { id: "champagne", name: "Champagne", description: "Soft gold and cream" },
  { id: "indigo", name: "Indigo", description: "Deep blue-purple" },
  { id: "steampunk", name: "Steampunk", description: "Brass and Victorian" },
  { id: "neon", name: "Neon", description: "Bright pink and cyan" },
  { id: "nebula", name: "Nebula", description: "Cosmic purple and pink" },
  { id: "obsidian", name: "Obsidian", description: "Volcanic black" },
  { id: "gothic", name: "Gothic", description: "Dark and dramatic" },
  { id: "inferno", name: "Inferno", description: "Fire and lava" },
  { id: "cyberpunk", name: "Cyberpunk", description: "Neon cyan and electric" },
] as const;

export const STORAGE_KEY = "minerva-theme-variants";

export function getStoredThemeVariants(): {
  light: ThemeVariantId;
  dark: ThemeVariantId;
} {
  if (typeof window === "undefined") {
    return { light: "minerva", dark: "minerva" };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { light?: string; dark?: string };
      const light = THEME_VARIANTS.some((t) => t.id === parsed.light)
        ? (parsed.light as ThemeVariantId)
        : "minerva";
      const dark = THEME_VARIANTS.some((t) => t.id === parsed.dark)
        ? (parsed.dark as ThemeVariantId)
        : "minerva";
      return { light, dark };
    }
  } catch {
    // ignore
  }
  return { light: "minerva", dark: "minerva" };
}

export function setStoredThemeVariants(variants: {
  light: ThemeVariantId;
  dark: ThemeVariantId;
}) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(variants));
    document.documentElement.setAttribute("data-light-theme", variants.light);
    document.documentElement.setAttribute("data-dark-theme", variants.dark);
  } catch {
    // ignore
  }
}
