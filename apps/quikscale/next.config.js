const path = require("path");

/**
 * Real-time (Socket.io) relay origin must be allow-listed in the CSP
 * `connect-src`, otherwise the browser blocks the WebSocket/polling
 * connection to the relay. Derive both the http(s) and ws(s) variants from
 * NEXT_PUBLIC_REALTIME_URL so dev (http/ws) and prod (https/wss) both work.
 */
const REALTIME_CONNECT_SRC = (() => {
  const url = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (!url) return "";
  try {
    const u = new URL(url);
    const wsScheme = u.protocol === "https:" ? "wss:" : "ws:";
    return `${u.protocol}//${u.host} ${wsScheme}//${u.host}`;
  } catch {
    return "";
  }
})();

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
  transpilePackages: [
    "@quikit/ui",
    "@quikit/auth",
    "@quikit/shared",
    "@quikit/database",
    "@quikit/redis",
    "@quikit/realtime",
  ],

  // Phase 4: Image optimization
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.githubusercontent.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "**.gravatar.com" },
    ],
  },

  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3002"],
    },
    // Phase 4: Enable optimized package imports for heavy deps
    optimizePackageImports: ["lucide-react", "@tanstack/react-query"],
    // Wires up Sentry via apps/quikscale/instrumentation.ts on server startup.
    instrumentationHook: true,
    outputFileTracingRoot: path.join(__dirname, "../.."),
  },

  /**
   * Security headers — Phase 3 of the A-Grade roadmap.
   *
   * Applied to EVERY response. These protect against:
   *   - XSS injection (CSP + X-XSS-Protection)
   *   - Clickjacking (X-Frame-Options)
   *   - MIME sniffing (X-Content-Type-Options)
   *   - Protocol downgrade (Strict-Transport-Security)
   *   - Referrer leaks (Referrer-Policy)
   *   - Unwanted browser APIs (Permissions-Policy)
   *
   * CSP is intentionally permissive for now (unsafe-eval for Next.js dev
   * mode, unsafe-inline for Tailwind + inline styles). Tighten the CSP
   * once a nonce-based strategy is in place.
   */
  async headers() {
    return [
      // Security headers for all routes
      {
        source: "/:path*",
        headers: [
          // Existing
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },

          // Phase 3 additions
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:",
              "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
              "font-src 'self' fonts.gstatic.com data:",
              "img-src 'self' data: blob: https:",
              // react-pdf fetches embedded fonts/assets via data: URLs.
              `connect-src 'self' https://*.sentry.io data: blob:${REALTIME_CONNECT_SRC ? " " + REALTIME_CONNECT_SRC : ""}`,
              // PDFViewer (react-pdf) loads its rendered PDF into an iframe via a
              // blob: URL and uses Web Workers to do the layout. Allow both.
              "frame-src 'self' blob:",
              "worker-src 'self' blob:",
              "child-src 'self' blob:",
              // Must be 'self' (not 'none') so the blob: PDF iframe — which
              // inherits this CSP — can be framed by the same origin.
              "frame-ancestors 'self'",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
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
