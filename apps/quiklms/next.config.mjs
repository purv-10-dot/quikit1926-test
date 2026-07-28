import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Prisma query-engine resolution for the webpack-bundled server runtime ---
// Next.js bundles the Prisma client runtime into `.next/server/...`, so its
// baked `__dirname` no longer sits next to the query-engine `.node` binary and
// Prisma throws "could not locate the Query Engine for runtime windows". Point
// the global `PRISMA_QUERY_ENGINE_LIBRARY` env at the SHARED `@quikit/database`
// client's engine (workspace `node_modules/.prisma/client`) so the bundled server
// resolves it. Guarded: only set when the var is unset AND the file exists, so it
// is a no-op wherever the engine already resolves natively.
if (!process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
  const engineDir = path.resolve(__dirname, '../../node_modules/.prisma/client');
  // The engine file MUST match the host OS, and the two naming conventions
  // overlap in a way that bites:
  //   Windows : query_engine-windows.dll.node
  //   Linux   : libquery_engine-linux-musl-openssl-3.0.x.so.node
  // The previous pattern was `/query_engine-.*\.node$/` — unanchored, so it
  // also matched the LINUX file via the "…lib[query_engine-]…" substring. With
  // both engines generated (binaryTargets = ["native", "linux-musl-…"]) and
  // readdirSync returning alphabetical order, "libquery_engine-…" (l) sorted
  // ahead of "query_engine-windows…" (q) — so on Windows this pinned
  // PRISMA_QUERY_ENGINE_LIBRARY to the Linux .so and every query died with
  // "is not a valid Win32 application", overriding Prisma's own (correct)
  // platform detection. Anchoring per-platform is the fix.
  //
  // On Linux the selected file is unchanged, so deploys behave exactly as before.
  const enginePattern =
    process.platform === 'win32'
      ? /^query_engine-.*\.dll\.node$/
      : /^libquery_engine-.*\.so\.node$/;
  try {
    const engine = fs.readdirSync(engineDir).find((f) => enginePattern.test(f));
    if (engine) {
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(engineDir, engine);
    }
    // No match → leave Prisma's own resolution alone rather than pinning the
    // wrong binary; it detects the platform correctly on its own.
  } catch {
    // engine dir missing (client not generated yet) — leave default resolution.
  }
}

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
  transpilePackages: ["@quikit/auth", "@quikit/shared", "@quikit/database", "@quikit/ui"],
  // The LMS now uses the SHARED `@quikit/database` client directly (post-fold),
  // exactly like quikscale/quikcrm/quiktrack — no `@prisma/client` alias to an
  // isolated LMS client. `@prisma/client` resolves to the workspace client whose
  // schema holds the `Lms`-prefixed models (app_quiklms) alongside central
  // identity (auth/quikit).
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
      // Object storage: branding + course assets.
      // GCS is the live backend; the amazonaws hosts stay for pre-migration rows.
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: '**.storage.googleapis.com' },
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
            // camera=(self): required by quiz/exam face proctoring
            // (`hooks/useFaceProctoring.ts` calls getUserMedia on this origin).
            // An empty allowlist here blocks the webcam even for our own pages.
            value: 'camera=(self), microphone=(), geolocation=(), browsing-topics=()',
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
