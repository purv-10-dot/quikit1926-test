import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // Needed to transform JSX in .test.tsx files and any .tsx component they
  // import (e.g. the marketing landing page). Mirrors apps/quikscale/vitest.config.ts.
  // Default env stays "node" (fast); DOM tests opt in per-file with the
  // `// @vitest-environment jsdom` directive.
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
    // Subpath aliases MUST come before the bare package alias — Vite matches
    // the first entry whose key prefixes the import, so a bare-package alias
    // listed first would rewrite "@quikit/shared/apiLogging" to a bad path.
    alias: {
      "@": path.resolve(__dirname, "."),
      "@quikit/database": path.resolve(__dirname, "../../packages/database"),
      "@quikit/auth": path.resolve(__dirname, "../../packages/auth"),
      "@quikit/ui/app-access-denied-popup": path.resolve(
        __dirname,
        "../../packages/ui/components/app-access-denied-popup",
      ),
      "@quikit/ui": path.resolve(__dirname, "../../packages/ui"),
      "@quikit/shared/apiLogging": path.resolve(__dirname, "../../packages/shared/lib/apiLogging"),
      "@quikit/shared/constants": path.resolve(__dirname, "../../packages/shared/lib/constants"),
      "@quikit/shared/login-url": path.resolve(__dirname, "../../packages/shared/lib/login-url"),
      "@quikit/shared": path.resolve(__dirname, "../../packages/shared"),
    },
  },
});
