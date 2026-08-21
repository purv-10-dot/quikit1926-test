import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // Needed for component tests (`__tests__/components/*.dom.test.tsx`), which
  // opt into jsdom per-file via a `// @vitest-environment jsdom` directive.
  // Without this plugin their JSX fails to parse.
  plugins: [react()],
  test: {
    environment: "node",
    setupFiles: ["./__tests__/setup.ts"],
    include: ["__tests__/**/*.test.{ts,tsx}"],
    exclude: ["__tests__/e2e/**", "node_modules/**"],
    // auth-config.test.ts deletes and reassigns shared process.env keys
    // (NODE_ENV, NEXT_PHASE, QUIKIT_*) around vi.resetModules() to re-import
    // lib/auth under different environments. Module registries are isolated per
    // file, but process.env is per WORKER — so running files in parallel let
    // those mutations land mid-import in another file and failed roughly one run
    // in five. The suite is ~2s end to end; determinism is worth more than the
    // parallelism here.
    fileParallelism: false,
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
      "@quikit/shared": path.resolve(__dirname, "../../packages/shared"),
    },
  },
});
