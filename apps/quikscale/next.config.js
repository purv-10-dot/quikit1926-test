const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Docker / self-hosted build output. See docs/engineering/GCP_DEPLOYMENT.md.
  // Only enabled when BUILD_STANDALONE=1 (set in Dockerfiles). On Vercel this
  // is unset so Next uses its default serverless output — mixing standalone
  // output with Vercel's runtime causes ERR_CONNECTION_CLOSED.
  ...(process.env.BUILD_STANDALONE === "1"
    ? { output: "standalone", outputFileTracingRoot: path.join(__dirname, "../../") }
    : {}),
  transpilePackages: [
    "@quikit/ui",
    "@quikit/auth",
    "@quikit/shared",
    "@quikit/database",
    "@quikit/redis",
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
      allowedOrigins: ["localhost:3004"],
    },
    // Phase 4: Enable optimized package imports for heavy deps
    optimizePackageImports: ["lucide-react", "@tanstack/react-query"],
    // Wires up Sentry via apps/quikscale/instrumentation.ts on server startup.
    instrumentationHook: true,
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
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
              "font-src 'self' fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://*.sentry.io",
              "frame-ancestors 'none'",
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
