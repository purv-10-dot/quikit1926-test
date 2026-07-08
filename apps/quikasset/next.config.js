const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Standalone output (self-contained Node server under .next/standalone) is
  // only emitted when NEXT_BUILD_STANDALONE=1 — set in apps/quikasset/Dockerfile.
  // It stays off for local `next build` because standalone symlinks the
  // monorepo's workspace deps, which requires admin privileges on Windows.
  output: process.env.NEXT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
  // Skip type/lint checks inside the Docker build — the pruned monorepo tree
  // may not include every devDep; these checks already run in CI.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ["@quikit/ui", "@quikit/auth", "@quikit/shared", "@quikit/database"],
  experimental: {
    // Trace workspace deps (@quikit/*) into the standalone bundle by rooting
    // file-tracing at the monorepo root rather than this app's directory.
    outputFileTracingRoot: path.join(__dirname, "../.."),
    serverActions: {
      allowedOrigins: ["localhost:3012", "asset.quikit.ai", "uatasset.quikit.ai"],
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
              "font-src 'self' fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
