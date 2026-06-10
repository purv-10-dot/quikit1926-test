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

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Standalone output (self-contained Node server under .next/standalone) is
  // only emitted when NEXT_BUILD_STANDALONE=1 — set in apps/quikcrm/Dockerfile.
  // It stays off for local `next build` because standalone symlinks the
  // monorepo's workspace deps, which requires admin privileges on Windows.
  output: process.env.NEXT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
  transpilePackages: ["@quikit/ui", "@quikit/auth", "@quikit/shared", "@quikit/database"],
  // Migration in progress: ported source has ESLint warnings (unused vars,
  // any-typed callbacks). TypeScript correctness is enforced via tsc; ESLint
  // can be re-enabled once the per-file cleanup pass lands.
  eslint: { ignoreDuringBuilds: true },
  // Type-checking runs separately via `npm run typecheck` (and in CI), so skip
  // it during `next build` — matches apps/quikscale, apps/quiktrack, and
  // apps/quikinfra (all set this). Without it, a single pre-existing type error
  // (e.g. the bullmq Queue typings in lib/queue) fails the whole build.
  typescript: { ignoreBuildErrors: true },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // API routes must use the Node entry; the browser bundle breaks renderToBuffer.
      config.resolve.alias = {
        ...config.resolve.alias,
        "@react-pdf/renderer": path.join(
          path.dirname(require.resolve("@react-pdf/renderer/package.json")),
          "lib",
          "react-pdf.js",
        ),
      };
    }
    return config;
  },
  experimental: {
    // Trace workspace deps (@quikit/*) into the standalone bundle by rooting
    // file-tracing at the monorepo root rather than this app's directory.
    outputFileTracingRoot: path.join(__dirname, "../.."),
    serverActions: {
      allowedOrigins: ["localhost:3008"],
    },
    // Match quikscale/quikinfra: rewrite lucide-react barrel imports to per-icon
    // ESM modules so the server (RSC/SSR) and client compilations resolve the
    // SAME icon build. Without this, lucide's barrel resolves differently across
    // the two webpack passes and SVG <rect> attributes (e.g. `ry`) differ →
    // "Extra attributes from the server: ry" hydration mismatch in the sidebar.
    optimizePackageImports: ["lucide-react", "@tanstack/react-query"],
    // Force Node build of react-pdf (browser build throws "Component is not a constructor").
    serverComponentsExternalPackages: [
      "@react-pdf/renderer",
      "@react-pdf/pdfkit",
      "@react-pdf/layout",
      "@react-pdf/font",
      "@react-pdf/render",
      "@react-pdf/primitives",
      "@react-pdf/reconciler",
      "@react-pdf/fns",
    ],
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
              "style-src 'self' 'unsafe-inline' fonts.googleapis.com rsms.me",
              "font-src 'self' fonts.gstatic.com rsms.me",
              "img-src 'self' data: blob: https:",
              "frame-src 'self' blob:",
              `connect-src 'self'${quikitConnectOrigin ? ` ${quikitConnectOrigin}` : ""}`,
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
