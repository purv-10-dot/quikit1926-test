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
    alias: [
      { find: "@", replacement: path.resolve(__dirname, ".") },
      { find: "@quikit/database", replacement: path.resolve(__dirname, "../../packages/database") },
      { find: "@quikit/auth", replacement: path.resolve(__dirname, "../../packages/auth") },
      { find: "@quikit/ui", replacement: path.resolve(__dirname, "../../packages/ui") },
      // Subpath aliases for @quikit/shared/<file> imports — must come BEFORE
      // the bare package alias so they win the prefix match.
      { find: /^@quikit\/shared\/rateLimit$/, replacement: path.resolve(__dirname, "../../packages/shared/lib/rateLimit.ts") },
      { find: /^@quikit\/shared\/constants$/, replacement: path.resolve(__dirname, "../../packages/shared/lib/constants.ts") },
      { find: /^@quikit\/shared\/email$/, replacement: path.resolve(__dirname, "../../packages/shared/lib/email.ts") },
      { find: /^@quikit\/shared\/pagination$/, replacement: path.resolve(__dirname, "../../packages/shared/lib/pagination.ts") },
      { find: /^@quikit\/shared\/env$/, replacement: path.resolve(__dirname, "../../packages/shared/lib/env.ts") },
      { find: /^@quikit\/shared\/moduleRegistry$/, replacement: path.resolve(__dirname, "../../packages/shared/lib/moduleRegistry.ts") },
      { find: /^@quikit\/shared\/apiLogging$/, replacement: path.resolve(__dirname, "../../packages/shared/lib/apiLogging.ts") },
      { find: /^@quikit\/shared\/redisCache$/, replacement: path.resolve(__dirname, "../../packages/shared/lib/redisCache.ts") },
      { find: /^@quikit\/shared\/dateFormat$/, replacement: path.resolve(__dirname, "../../packages/shared/lib/dateFormat.ts") },
      { find: /^@quikit\/shared\/sso-domain-server$/, replacement: path.resolve(__dirname, "../../packages/shared/lib/sso-domain-server.ts") },
      { find: /^@quikit\/shared\/types$/, replacement: path.resolve(__dirname, "../../packages/shared/types/index.ts") },
      { find: "@quikit/shared", replacement: path.resolve(__dirname, "../../packages/shared") },
    ],
  },
});
