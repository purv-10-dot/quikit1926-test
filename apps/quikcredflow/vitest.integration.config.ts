import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Vitest config for integration tests — real Postgres, no mocks.
 *
 * Run: npm run test:integration
 *
 * Differences from vitest.config.ts:
 *   - setupFiles points to __tests__/integration/setup.ts (loads .env.local,
 *     no vi.mock() calls).
 *   - include targets only __tests__/integration/**
 *   - testTimeout is longer (DB round-trips are slower than in-memory mocks).
 */
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./__tests__/integration/setup.ts"],
    include: ["__tests__/integration/**/*.integration.test.{ts,tsx}"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@quikit/database": path.resolve(__dirname, "packages/database"),
      "@quikit/ui": path.resolve(__dirname, "packages/ui"),
      "@quikit/shared/moduleRegistry": path.resolve(
        __dirname,
        "packages/shared/lib/moduleRegistry.ts",
      ),
      "@quikit/shared": path.resolve(__dirname, "packages/shared"),
    },
  },
});
