import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The end-to-end tests build into their own folder, so they never disturb the development server's cache.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
