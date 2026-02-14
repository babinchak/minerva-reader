import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow loading the dev server from other devices on your LAN (e.g. phone).
  // Add more origins here if you use a different IP/port.
  // NOTE: Next expects hostnames (no scheme). Ports may be included.
  allowedDevOrigins: ["192.168.68.55", "192.168.68.55:3000"],
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
  // Prevent bundling pdfjs-dist/pdf-to-img so worker path resolves correctly in Node
  serverExternalPackages: ["pdfjs-dist", "pdf-to-img"],
};

export default nextConfig;
