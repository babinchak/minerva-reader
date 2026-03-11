import Image from "next/image";

interface MinervaLogoProps {
  size?: number;
  className?: string;
  /** Use a larger source for big hero placements */
  variant?: "default" | "large";
}

/** Pick source that is at least 2x display size for crisp rendering on retina. */
function getLogoSrc(displaySize: number, variant: "default" | "large"): string {
  const minPixels = Math.max(displaySize * 2, 64);
  if (variant === "large" || minPixels >= 96) {
    if (minPixels > 256) return "/icons/icon-512.png";
    if (minPixels > 96) return "/icons/icon-192.png";
    return "/icons/favicon-96.png";
  }
  return "/favicon-32.png";
}

/** Owl face logo - transparent PNG works on light and dark backgrounds. */
export function MinervaLogo({ size = 32, className, variant = "default" }: MinervaLogoProps) {
  const src = getLogoSrc(size, variant);
  return (
    <Image
      src={src}
      alt="Minerva Reader"
      width={size}
      height={size}
      className={className}
      unoptimized
    />
  );
}
