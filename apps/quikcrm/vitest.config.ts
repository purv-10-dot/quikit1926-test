import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Vitest 3 + Vite 5 — runs on Node 20.14+ (no Rolldown / Vitest 4 native bindings).
// Other monorepo apps may use Vitest 4; quikcrm is pinned via root package.json overrides.
export default defineConfig({
  plugins: [react()],
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
      "@quikit/shared/moduleRegistry": path.resolve(
        __dirname,
        "../../packages/shared/lib/moduleRegistry.ts",
      ),
      "@quikit/shared": path.resolve(__dirname, "../../packages/shared"),
    },
  },
});
