import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Defaults from create-next-app (Next.js 16).
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
  // WHY: lib/data/load.ts and lib/insights/benchmarks.ts read data files with fs at runtime.
  // Next.js can't detect that automatically, so we tell it to ship these
  // files with the API routes when deploying (e.g. to Vercel).
  outputFileTracingIncludes: {
    "/api/*": ["./data/demo/**/*.json", "./data/benchmarks.json"],
  },
};

export default nextConfig;
