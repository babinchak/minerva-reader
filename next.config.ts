import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    middlewareClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
