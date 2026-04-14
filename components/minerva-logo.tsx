import Image from "next/image";

interface MinervaLogoProps {
  size?: number;
  className?: string;
  /** Use a larger source for big hero placements */
  variant?: "default" | "large";
}

/** Pick transparent source that is at least 2x display size for crisp rendering on retina. */
function getLogoSrc(displaySize: number, variant: "default" | "large"): string {
  const minPixels = Math.max(displaySize * 2, 64);
  if (variant === "large" || minPixels > 256) return "/icons/logo-512.png";
  if (minPixels > 96) return "/icons/logo-192.png";
  if (minPixels > 48) return "/icons/logo-96.png";
  return "/icons/logo-48.png";
}

/** Owl face logo - black on transparent, inverts to white in dark mode. */
export function MinervaLogo({ size = 32, className, variant = "default" }: MinervaLogoProps) {
  const src = getLogoSrc(size, variant);
  return (
    <Image
      src={src}
      alt="Minerva Reader"
      width={size}
      height={size}
      className={`dark:invert ${className ?? ""}`}
    />
  );
}
