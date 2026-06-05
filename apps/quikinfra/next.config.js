const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output (self-contained Node server under .next/standalone) is
  // only emitted when NEXT_BUILD_STANDALONE=1 — set in apps/quikinfra/Dockerfile.
  // It stays off for local `next build` because standalone symlinks the
  // monorepo's workspace deps, which requires admin privileges on Windows.
  output: process.env.NEXT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
  // Skip type/lint checks during `next build` — these run in CI, and the
  // build tree may not include every devDep. Matches apps/quikscale +
  // apps/quiktrack (both set these). Without this, a type error in any single
  // route fails the whole build.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Trace workspace deps (@quikit/*) into the standalone bundle by rooting
    // file-tracing at the monorepo root rather than this app's directory.
    outputFileTracingRoot: path.join(__dirname, "../.."),
    // Tree-shake lucide-react's barrel file (used in 90+ files) so each
    // route only ships the icons it actually imports. No source changes
    // required — Next rewrites the imports at build time.
    optimizePackageImports: ["lucide-react"],
    // QuikInfra now uses the shared central Prisma client (@quikit/database),
    // generated to the standard node_modules/.prisma path which Next's
    // default file-tracing already walks — no custom include needed (matches
    // apps/quiktrack + apps/quikscale).
  },
};

module.exports = nextConfig;
