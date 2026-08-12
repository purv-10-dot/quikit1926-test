/** @type {import('next').NextConfig} */
const path = require("path");

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Standalone output (self-contained Node server under .next/standalone) is
  // only emitted when NEXT_BUILD_STANDALONE=1 — set in apps/quikcrmexpress/Dockerfile,
  // which then COPYs .next/standalone into the runner stage. Without this the
  // image build fails on a missing directory. It stays off for local
  // `next build` because standalone symlinks the monorepo's workspace deps,
  // which requires admin privileges on Windows.
  output: process.env.NEXT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
  transpilePackages: ["@quikit/ui", "@quikit/auth", "@quikit/shared", "@quikit/database"],
  // Skip type/lint checks during `next build` — these run in CI (and via
  // `npm run typecheck`), and the pruned monorepo tree Docker builds from may
  // not include every devDep. Matches quikscale, quikinfra and quiktrack, all
  // three of which set both. Without ignoreBuildErrors a type error in any
  // single route fails the whole image build.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
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
    // Trace workspace deps from the monorepo root, or the standalone output
    // ships without the @quikit/* packages it resolves at runtime.
    outputFileTracingRoot: path.join(__dirname, "../.."),
    serverActions: {
      // This app's own dev origin. Was localhost:3009 (quikcrm's port) —
      // carried over by the fork, which rejected this app's own requests.
      allowedOrigins: ["localhost:3017"],
    },
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
