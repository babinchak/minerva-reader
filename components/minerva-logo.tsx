"use client";

import Image from "next/image";

interface MinervaLogoProps {
  size?: number;
  className?: string;
}

/** Owl face logo - transparent PNG works on light and dark backgrounds. */
export function MinervaLogo({ size = 32, className }: MinervaLogoProps) {
  return (
    <Image
      src="/favicon-32.png"
      alt="Minerva Reader"
      width={size}
      height={size}
      className={className}
      unoptimized
    />
  );
}
