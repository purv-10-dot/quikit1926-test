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
    // Subpath aliases MUST come before the bare package alias — Vite matches
    // the first entry whose key prefixes the import, so a bare-package alias
    // listed first would rewrite "@quikit/shared/apiLogging" to a bad path.
    alias: {
      "@": path.resolve(__dirname, "."),
      "@quikit/database": path.resolve(__dirname, "../../packages/database"),
      "@quikit/auth": path.resolve(__dirname, "../../packages/auth"),
      "@quikit/ui": path.resolve(__dirname, "../../packages/ui"),
      "@quikit/shared/apiLogging": path.resolve(__dirname, "../../packages/shared/lib/apiLogging"),
      "@quikit/shared/constants": path.resolve(__dirname, "../../packages/shared/lib/constants"),
      "@quikit/shared": path.resolve(__dirname, "../../packages/shared"),
    },
  },
});
