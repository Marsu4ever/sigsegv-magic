import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Short git commit this build came from (shown via lib/version.ts).
 * WHY this order: a deploy can pass APP_COMMIT = the TEAM repo's commit (Vercel's own
 * VERCEL_GIT_COMMIT_SHA can be an empty "deploy" commit); locally we just ask git.
 */
function buildCommit(): string {
  const fromEnv = process.env.APP_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  // Which build is running: baked in at build time, read by lib/version.ts.
  env: {
    APP_VERSION: JSON.parse(readFileSync("package.json", "utf8")).version,
    APP_COMMIT: buildCommit(),
    APP_BUILT_AT: new Date().toISOString(),
  },
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
