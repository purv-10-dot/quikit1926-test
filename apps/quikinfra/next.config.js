/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'standalone', // Requires admin for symlinks on Windows
  experimental: {
    // Tree-shake lucide-react's barrel file (used in 90+ files) so each
    // route only ships the icons it actually imports. No source changes
    // required — Next rewrites the imports at build time.
    optimizePackageImports: ["lucide-react"],
    // Prisma client is generated to .prisma-qc2 (custom output, see
    // prisma/schema.prisma). Next.js's default file-tracing only walks the
    // standard .prisma path, so we explicitly include the engine binaries
    // and the generated client for every API route. Without this Vercel
    // deploys crash with "Query Engine not found for rhel-openssl-3.0.x".
    // On Next 14 this key sits under `experimental`; it moved to the top
    // level in Next 15.
    outputFileTracingIncludes: {
      "/api/**/*": ["./node_modules/.prisma-qc2/client/**/*"],
    },
  },
};

module.exports = nextConfig;
