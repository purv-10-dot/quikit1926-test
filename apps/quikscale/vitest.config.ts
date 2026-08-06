import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/tests/**",
      "**/__tests__/e2e/**",
      "**/dist/**",
    ],
    // Default env is "node" (fast). DOM tests opt in per-file with the
    // directive `// @vitest-environment jsdom` at the top of the .tsx file.
    // Vitest 4 removed `environmentMatchGlobs` — this is the supported path.
    environment: "node",
    setupFiles: ["./__tests__/setup.ts"],
    clearMocks: true,
    // Pin the timezone so date/time-formatting assertions (e.g. audit timeline
    // timestamps) are deterministic regardless of the developer's machine TZ.
    // Production renders audit timestamps in the VIEWER's local timezone; tests
    // assert the UTC-rendered strings, so the worker must run in UTC.
    env: { TZ: "UTC" },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "lib/**/*.{ts,tsx}",
        "app/api/**/*.{ts,tsx}",
        "components/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/__tests__/**",
        "**/.next/**",
        "**/node_modules/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@quikit/database": path.resolve(__dirname, "../../packages/database"),
      "@quikit/auth": path.resolve(__dirname, "../../packages/auth"),
      // Subpath exports must be aliased BEFORE the bare package alias —
      // Vite matches these in order, and "@quikit/ui" alone would rewrite
      // "@quikit/ui/support" to a non-existent packages/ui/support.
      "@quikit/ui/support": path.resolve(__dirname, "../../packages/ui/components/support"),
      "@quikit/ui": path.resolve(__dirname, "../../packages/ui"),
      "@quikit/shared/rateLimit": path.resolve(__dirname, "../../packages/shared/lib/rateLimit"),
      "@quikit/shared/pagination": path.resolve(__dirname, "../../packages/shared/lib/pagination"),
      "@quikit/shared/moduleRegistry": path.resolve(__dirname, "../../packages/shared/lib/moduleRegistry"),
      "@quikit/shared/redisCache": path.resolve(__dirname, "../../packages/shared/lib/redisCache"),
      "@quikit/shared/apiLogging": path.resolve(__dirname, "../../packages/shared/lib/apiLogging"),
      "@quikit/shared/sso-domain-server": path.resolve(__dirname, "../../packages/shared/lib/sso-domain-server"),
      "@quikit/shared/dateFormat": path.resolve(__dirname, "../../packages/shared/lib/dateFormat"),
      "@quikit/shared/login-url": path.resolve(__dirname, "../../packages/shared/lib/login-url"),
      "@quikit/shared/email": path.resolve(__dirname, "../../packages/shared/lib/email"),
      "@quikit/shared/env": path.resolve(__dirname, "../../packages/shared/lib/env"),
      "@quikit/shared/constants": path.resolve(__dirname, "../../packages/shared/lib/constants"),
      "@quikit/shared/supportContent": path.resolve(__dirname, "../../packages/shared/lib/supportContent"),
      "@quikit/shared/temp-password": path.resolve(__dirname, "../../packages/shared/lib/temp-password"),
      "@quikit/shared/types": path.resolve(__dirname, "../../packages/shared/types"),
      "@quikit/shared": path.resolve(__dirname, "../../packages/shared"),
    },
  },
});
