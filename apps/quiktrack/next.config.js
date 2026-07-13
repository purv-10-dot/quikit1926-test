const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Container build: emit a self-contained Node server under .next/standalone.
  // outputFileTracingRoot points at the monorepo root so workspace deps
  // (@quikit/*) are traced into the standalone bundle.
  output: "standalone",
  // Skip type/lint checks inside the Docker build — the pruned monorepo
  // tree may not include every devDep; these checks already run in CI.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  swcMinify: true,
  transpilePackages: ["@quikit/ui", "@quikit/auth", "@quikit/shared", "@quikit/database"],
  experimental: {
    serverActions: {
      // Replace 3010 with your app's port (matches package.json scripts).
      allowedOrigins: ["localhost:3004"],
    },
    outputFileTracingRoot: path.join(__dirname, "../.."),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // SEC-06: Content-Security-Policy is now set per-request in middleware.ts
          // (nonce-based, no 'unsafe-inline' in script-src). It must NOT also be
          // set here — two CSP headers would be enforced as their intersection and
          // the static 'unsafe-inline' policy would conflict with the nonce one.
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
