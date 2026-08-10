import { defineConfig } from "vitest/config";
import path from "path";

// First test config for apps/auth — the app already declared `test: vitest run`
// in package.json but had no config or test files. API-route tests only, so no
// react plugin / jsdom environment here; add both if component tests land later.
export default defineConfig({
  test: {
    root: path.resolve(__dirname),
    include: ["__tests__/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/__tests__/e2e/**"],
    environment: "node",
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: ["**/*.test.ts", "**/__tests__/**", "**/.next/**", "**/node_modules/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@quikit/database": path.resolve(__dirname, "../../packages/database"),
      "@quikit/auth": path.resolve(__dirname, "../../packages/auth"),
      "@quikit/shared": path.resolve(__dirname, "../../packages/shared"),
    },
  },
});
