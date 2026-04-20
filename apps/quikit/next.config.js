const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Docker / self-hosted build: produce a minimal standalone bundle at
  // .next/standalone. Reduces the Docker runner image from ~2GB naive to
  // ~250MB. Required for the GCP / Linux deployment flow documented in
  // docs/engineering/GCP_DEPLOYMENT.md. No-op on Vercel (Vercel ignores it).
  // Docker-only; Vercel unsets BUILD_STANDALONE so default serverless output is used.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" } : {}),
  // In a turborepo, Next must trace deps up to the repo root so shared
  // workspace packages (@quikit/*) + Prisma engine files are copied into
  // the standalone output. Without this, runtime fails with module-not-found
  // on first request.
  ...(process.env.BUILD_STANDALONE === "1" ? { outputFileTracingRoot: path.join(__dirname, "../../") } : {}),
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
              "connect-src 'self' https://*.sentry.io",
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
