import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  images: {
    // Part art is line-art PNG — AVIF/WebP cut it dramatically.
    formats: ["image/avif", "image/webp"],
    // Part files are content-addressed, so an optimised variant never goes stale.
    minimumCacheTTL: 31536000,
  },
};

export default nextConfig;
