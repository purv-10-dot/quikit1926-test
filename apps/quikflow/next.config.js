/** @type {import('next').NextConfig} */
const path = require("path");

// This app's own public origin (e.g. https://uatflow.quikit.ai). Server Actions
// reject POSTs whose Origin header isn't in `allowedOrigins`, so the deployed
// host MUST be listed or every Server Action 403s behind the UAT ingress.
// Host-only (no scheme) is the format Next expects here.
const publicOrigin = process.env.NEXT_PUBLIC_QUIKFLOW_URL || process.env.QUIKFLOW_URL || "";
const publicHost = publicOrigin.replace(/^https?:\/\//, "").replace(/\/$/, "");

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Standalone output (self-contained Node server under .next/standalone) is
  // only emitted when NEXT_BUILD_STANDALONE=1 — set in apps/quikflow/Dockerfile,
  // which then COPYs .next/standalone into the runner stage. Without this the
  // image build fails on a missing directory. It stays off for local
  // `next build` because standalone symlinks the monorepo's workspace deps,
  // which requires admin privileges on Windows.
  output: process.env.NEXT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
  transpilePackages: ["@quikit/ui", "@quikit/auth", "@quikit/shared", "@quikit/database"],
  // Skip type/lint checks during `next build` — these run in CI (and via
  // `npm run typecheck`), and the pruned monorepo tree Docker builds from may
  // not include every devDep. Matches quikscale, quikinfra and quikcrmexpress.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Trace workspace deps from the monorepo root, or the standalone output
    // ships without the @quikit/* packages it resolves at runtime.
    outputFileTracingRoot: path.join(__dirname, "../.."),
    serverActions: {
      allowedOrigins: ["localhost:3014", ...(publicHost ? [publicHost] : [])],
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
