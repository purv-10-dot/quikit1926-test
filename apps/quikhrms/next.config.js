const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone build → lean Docker runner (.next/standalone/apps/quikhrms/server.js).
  output: "standalone",
  // Transpile the shared workspace packages (same list as the other product
  // apps) so Next compiles their TypeScript instead of treating them as
  // pre-built node_modules — required for the pruned Docker build.
  transpilePackages: [
    "@quikit/ui",
    "@quikit/auth",
    "@quikit/shared",
    "@quikit/database",
    "@quikit/redis",
  ],
  // Lint runs separately (`npm run lint` / turbo lint), not as a build gate —
  // and eslint-config-next doesn't resolve in the pruned Docker image.
  eslint: { ignoreDuringBuilds: true },
  // Type-checking is a separate gate (`npm run typecheck`). We skip it during the
  // production build because the Docker install hoists @prisma/client to v7, which
  // makes the type-checker (following an import chain into the Prisma-5 shared
  // packages/database) emit a false "no exported member 'PrismaClient'" error.
  // HRMS's own types are still validated by `npm run typecheck` in dev/CI.
  typescript: { ignoreBuildErrors: true },
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  experimental: {
    // Monorepo: trace files from the repo root so workspace deps (@quikit/*)
    // are bundled into .next/standalone. In Next 14 this is an EXPERIMENTAL
    // option — at the top level it is silently ignored (the bug the other apps
    // already avoid by nesting it here).
    outputFileTracingRoot: path.join(__dirname, "../.."),
  },
  // Force ONE lucide-react across the server + client bundles. The monorepo
  // hoists lucide 0.294 (the version the other apps pin) to the repo root,
  // while HRMS nests its own 1.x. Without this alias the SERVER bundle resolves
  // the hoisted 0.294 and the CLIENT resolves HRMS's nested 1.x; their icon
  // `className` output differs (0.294 emits a trailing space, 1.x trims it) →
  // a React hydration mismatch on every lucide icon. `require.resolve` runs
  // from this app dir, so it pins HRMS's own nested copy for both compilations.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "lucide-react$": require.resolve("lucide-react"),
    };
    return config;
  },
};

module.exports = nextConfig;
