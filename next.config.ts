import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow loading the dev server from other devices on your LAN (e.g. phone).
  // Add more origins here if you use a different IP/port.
  // NOTE: Next expects hostnames (no scheme). Ports may be included.
  allowedDevOrigins: ["192.168.68.55", "192.168.68.55:3000"],
  // Keep pdf-to-img out of the Next.js bundle so pdfjs worker paths resolve
  // correctly at runtime (needed for PDF cover thumbnail generation).
  serverExternalPackages: ["pdf-to-img", "@napi-rs/canvas"],
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
