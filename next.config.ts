import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir:
    process.env.NEXT_DIST_DIR ||
    (process.env.NODE_ENV === "development" ? ".next-local" : ".next"),
  outputFileTracingRoot: process.cwd(),
  images: {
    // Part art is line-art PNG — AVIF/WebP cut it dramatically.
    formats: ["image/avif", "image/webp"],
    // Part files are content-addressed, so an optimised variant never goes stale.
    minimumCacheTTL: 31536000,
    // Avatars uploaded before browser-side shrinking are still full-size photos;
    // routing them through the optimiser fixes the ones already in storage.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "qhxcwyqnlbrbnrqfkngb.supabase.co",
        pathname: "/storage/v1/object/public/avatars/**",
      },
    ],
  },
};

export default nextConfig;
