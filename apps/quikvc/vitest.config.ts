import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./__tests__/setup.ts"],
    include: ["__tests__/**/*.test.{ts,tsx}"],
    exclude: ["__tests__/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["app/**", "lib/**", "components/**"],
      exclude: ["**/*.d.ts", "**/__tests__/**", "**/node_modules/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@quikit/database": path.resolve(__dirname, "../../packages/database"),
      "@quikit/auth": path.resolve(__dirname, "../../packages/auth"),
      "@quikit/ui": path.resolve(__dirname, "../../packages/ui"),
      // Subpath aliases must come BEFORE the bare-package alias.
      "@quikit/shared/rateLimit": path.resolve(__dirname, "../../packages/shared/lib/rateLimit"),
      "@quikit/shared/pagination": path.resolve(__dirname, "../../packages/shared/lib/pagination"),
      "@quikit/shared/moduleRegistry": path.resolve(__dirname, "../../packages/shared/lib/moduleRegistry"),
      "@quikit/shared/redisCache": path.resolve(__dirname, "../../packages/shared/lib/redisCache"),
      "@quikit/shared/apiLogging": path.resolve(__dirname, "../../packages/shared/lib/apiLogging"),
      "@quikit/shared": path.resolve(__dirname, "../../packages/shared"),
    },
  },
});
