import Image from "next/image";

interface MinervaLogoProps {
  size?: number;
  className?: string;
  /** Use a larger source for big hero placements */
  variant?: "default" | "large";
}

/** Owl face logo - transparent PNG works on light and dark backgrounds. */
export function MinervaLogo({ size = 32, className, variant = "default" }: MinervaLogoProps) {
  const src = variant === "large" ? "/icons/favicon-96.png" : "/favicon-32.png";
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
