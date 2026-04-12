/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  transpilePackages: [
    "@quikit/ui",
    "@quikit/auth",
    "@quikit/shared",
    "@quikit/database",
    "@quikit/redis",
    "@quikit/logger",
  ],
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3004"],
    },
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
    // Allowed origins for CORS — localhost in dev, production domain in prod
    const allowedOrigins = [
      "http://localhost:3004",
      "http://localhost:3005",
      "http://localhost:3006",
      process.env.NEXT_PUBLIC_APP_URL,
    ]
      .filter(Boolean)
      .join(", ");

    return [
      // CORS headers for API routes
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: allowedOrigins },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, X-Request-ID",
          },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
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
