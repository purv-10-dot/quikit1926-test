/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'standalone', // Requires admin for symlinks on Windows
  experimental: {
    // Tree-shake lucide-react's barrel file (used in 90+ files) so each
    // route only ships the icons it actually imports. No source changes
    // required — Next rewrites the imports at build time.
    optimizePackageImports: ["lucide-react"],
  },
};

module.exports = nextConfig;
