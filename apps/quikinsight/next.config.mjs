/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained Node server under .next/standalone — required by
  // apps/quikinsight/Dockerfile's runner stage (COPY .../.next/standalone)
  output: "standalone",
  // Required for Vercel: transpile workspace packages (source TypeScript/ESM)
  transpilePackages: [
    "@quikit/ui",
    "@quikit/auth",
    "@quikit/shared",
    "@quikit/database",
    "@quikit/redis",
  ],
  // Skip type/lint in Vercel builds — run separately in CI
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
