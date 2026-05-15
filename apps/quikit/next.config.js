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
  ],
  // Needed for apps/quikit/instrumentation.ts to run at server startup.
  // Wires up Sentry server/edge configs.
  experimental: {
    instrumentationHook: true,
  },
  /**
   * Multi-zone: the marketing site (separate Vercel project) owns the
   * public surface; the launcher owns auth/app. We reverse-proxy an
   * EXPLICIT allow-list of marketing paths to MARKETING_ORIGIN (never a
   * catch-all — that would swallow /apps, /api/auth/*, etc. and the
   * marketing app's own /[slug]). Everything else stays launcher-local.
   * Unset MARKETING_ORIGIN → no rewrites (clean rollback).
   */
  async rewrites() {
    const MKT = process.env.MARKETING_ORIGIN;
    if (!MKT) return { beforeFiles: [] };
    const exact = [
      "/",
      "/blog",
      "/sitemap.xml",
      "/robots.txt",
      "/platform",
      "/products",
      "/pricing",
      "/contact",
      "/quikcrm",
      "/quikinfra",
      "/quikscale",
      "/quiksocial",
      "/quiktrack",
    ];
    return {
      beforeFiles: [
        ...exact.map((s) => ({ source: s, destination: `${MKT}${s}` })),
        { source: "/blog/:path*", destination: `${MKT}/blog/:path*` },
        { source: "/assets/:path*", destination: `${MKT}/assets/:path*` },
        { source: "/api/contact", destination: `${MKT}/api/contact` },
        { source: "/api/posts", destination: `${MKT}/api/posts` },
        { source: "/api/pages/:path*", destination: `${MKT}/api/pages/:path*` },
      ],
    };
  },
  async headers() {
    // The proxied marketing HTML loads its own _next chunks from the
    // marketing origin (assetPrefix) and the modal calls the auth service
    // for forgot-password. Allow those origins in the CSP, else the
    // proxied site's JS/auth break under the launcher's strict policy.
    const MKT = process.env.MARKETING_ORIGIN || "https://quikit-marketing.vercel.app";
    const AUTHO =
      process.env.NEXT_PUBLIC_AUTH_API_ORIGIN || "https://auth-quikit.vercel.app";
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
              // cdn.jsdelivr.net is allowed for the Swagger UI bundle on /api/docs.
              `script-src 'self' 'unsafe-eval' 'unsafe-inline' cdn.jsdelivr.net ${MKT}`,
              `style-src 'self' 'unsafe-inline' fonts.googleapis.com cdn.jsdelivr.net ${MKT}`,
              "font-src 'self' fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              `connect-src 'self' https://*.sentry.io ${AUTHO} ${MKT}`,
              "frame-ancestors 'none'",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-XSS-Protection", value: "1; mode=block" },
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
