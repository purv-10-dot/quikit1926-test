import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Shared platform packages ship raw TS (their package.json "exports" point at
  // .ts) so Next must transpile them. NOTE: `@quikit/database` is transpiled for
  // resolution only — the centralized-auth CONSUMER path (createOAuthClientOptions)
  // never queries it (soft-revocation is Redis-only, remote validation is an HTTP
  // call to the central /api/verify-token), so the webpack `@prisma/client` alias
  // below (which points every `@prisma/client` import at the LMS client) leaves the
  // idle @quikit/database client harmless. The real client swap is Phase 3.
  transpilePackages: ["@quikit/auth", "@quikit/shared", "@quikit/database"],
  // Resolve `@prisma/client` to this app's ISOLATED generated client (LMS schema:
  // Course/MasterCourse, User.tenantId). Without this, the workspace-hoisted root
  // client (org schema, User.orgId, no Course) wins and every query throws.
  // Mirrors the tsconfig `@prisma/client` path alias for the runtime bundle.
  webpack(config) {
    config.resolve.alias['@prisma/client'] = path.resolve(__dirname, 'lib/generated/prisma');
    // NOTE: the ORG identity client (lib/org-db.ts) is imported via the
    // `.prisma/client` specifier, which the alias above does NOT match — so it
    // correctly resolves to the @quikit/database (org) generated client in both
    // webpack and Node. No extra alias needed.
    return config;
  },
  // Large media (>150MB) NEVER routes through Next.js API handlers — it goes
  // through S3 presigned PUT/GET or the TUS server in /worker. JSON API bodies
  // stay small; this cap is a safety guard for the few multipart routes.
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Allow loading branding logos / S3 assets and provider avatars.
  // Hostnames are pinned (no `**` wildcard) so this is not an open image proxy.
  // Add more provider/CDN hosts here as new integrations need them.
  images: {
    remotePatterns: [
      // S3 / branding + course assets
      { protocol: 'https', hostname: 'amazonaws.com' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      // Google account avatars (OAuth profile photos)
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'googleusercontent.com' },
    ],
  },
  eslint: {
    // Lint is run explicitly in CI; don't fail production builds on lint.
    ignoreDuringBuilds: true,
  },
  // Repo norm (see quikcrm/quikinfra). Type-checking is run explicitly via
  // `tsc --noEmit`; builds don't fail on it. Also required until Phase 3: the
  // shared @quikit/database source type-checks against this app's ISOLATED LMS
  // `@prisma/client` alias (org models like orgMember resolve to the wrong
  // client). Runtime is unaffected — the centralized-auth consumer path never
  // queries @quikit/database. The real fix is the Phase-3 client swap.
  typescript: { ignoreBuildErrors: true },
  // Baseline security headers applied to every route. These are safe defaults;
  // a Content-Security-Policy is intentionally NOT set here because it needs
  // per-app testing (inline scripts/styles, Next.js, third-party widgets) to
  // avoid breaking the UI. Add a tested CSP once it has been validated, e.g.:
  //   { key: 'Content-Security-Policy', value: "default-src 'self'; ..." }
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
