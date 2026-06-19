import { defineConfig } from "vitest/config";
import path from "path";

// Minimal Vitest setup for quikhrms API/unit tests. Node env (fast); the `@`
// alias mirrors tsconfig (`@/*` → `./*`). No React plugin — DOM/component
// tests would add it per the repo's testing standards when first needed.
export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/__tests__/e2e/**", "**/dist/**"],
    environment: "node",
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@quikit/auth": path.resolve(__dirname, "../../packages/auth"),
    },
  },
});
