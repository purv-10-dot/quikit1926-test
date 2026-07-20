/** @type {import('next').NextConfig} */
const path = require("path");

const quikitConnectOrigin = (() => {
  const raw = process.env.QUIKIT_URL || process.env.NEXT_PUBLIC_QUIKIT_URL || "";
  try {
    return raw ? new URL(raw).origin : "";
  } catch {
    return "";
  }
})();

// Realtime gateway origin (WebSocket). The browser opens the socket, so this
// MUST be a NEXT_PUBLIC_* var read at build time. Its origin (e.g.
// wss://realtime.quikit.ai) is added to connect-src so the CSP permits the
// client connection. Empty when unset (Batch 1 scaffold) → no CSP entry.
const realtimeConnectOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_REALTIME_WS_URL || "";
  try {
    return raw ? new URL(raw).origin : "";
  } catch {
    return "";
  }
})();

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Standalone output (self-contained Node server under .next/standalone) is
  // only emitted when NEXT_BUILD_STANDALONE=1 — set in apps/quikchat/Dockerfile.
  // It stays off for local `next build` because standalone symlinks the
  // monorepo's workspace deps, which requires admin privileges on Windows.
  output: process.env.NEXT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
  transpilePackages: ["@quikit/ui", "@quikit/auth", "@quikit/shared", "@quikit/database"],
  // ESLint runs separately via `npm run lint`; skip during `next build`.
  eslint: { ignoreDuringBuilds: true },
  // Type-checking runs separately via `npm run typecheck` (and in CI), so skip
  // it during `next build` — matches apps/quikcrm, quikscale, quiktrack.
  typescript: { ignoreBuildErrors: true },
  experimental: {
    // Run instrumentation.ts once at server startup (Next 14.0.4 requires this
    // opt-in for the register() hook to fire).
    instrumentationHook: true,
    // Trace workspace deps (@quikit/*) into the standalone bundle by rooting
    // file-tracing at the monorepo root rather than this app's directory.
    outputFileTracingRoot: path.join(__dirname, "../.."),
    serverActions: {
      allowedOrigins: ["localhost:3011"],
    },
    // Rewrite lucide-react barrel imports to per-icon ESM modules so the
    // server (RSC/SSR) and client compilations resolve the SAME icon build
    // (avoids hydration mismatches). Mirrors quikcrm/quikscale/quikinfra.
    optimizePackageImports: ["lucide-react", "@tanstack/react-query"],
  },
  async headers() {
    // 'self' + the QuikIT launcher origin + the realtime gateway origin.
    // Both origin helpers return "" when their env var is unset (scaffold),
    // and .filter(Boolean) drops empties so the directive stays valid.
    const connectSrc = ["'self'", quikitConnectOrigin, realtimeConnectOrigin, "https://storage.googleapis.com"]
      .filter(Boolean)
      .join(" ");
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
              "style-src 'self' 'unsafe-inline' fonts.googleapis.com rsms.me",
              "font-src 'self' fonts.gstatic.com rsms.me",
              // GCS-hosted media (bucket quikit-bucket) is served over https,
              // so `https:` covers it — no images.remotePatterns needed.
              "img-src 'self' data: blob: https:",
              "frame-src 'self' blob:",
              `connect-src ${connectSrc}`,
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
