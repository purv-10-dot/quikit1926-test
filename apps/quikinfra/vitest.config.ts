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
    environment: "node",
    setupFiles: ["./__tests__/setup.ts"],
    clearMocks: true,
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
  // QuikInfra keeps all app code at the root (app/, lib/, components/, hooks/)
  // — no `src/` folder — so `@` maps straight to the app root. The
  // `@quikit/shared/*` subpaths are mapped explicitly (they resolve through
  // the package's `exports` map to `lib/`, so a bare `@quikit/shared` prefix
  // alias would not find them). Mirrors the other apps' vitest configs.
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@quikit/database": path.resolve(__dirname, "../../packages/database"),
      "@quikit/auth": path.resolve(__dirname, "../../packages/auth"),
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
      "@quikit/shared/temp-password": path.resolve(__dirname, "../../packages/shared/lib/temp-password"),
      "@quikit/shared/types": path.resolve(__dirname, "../../packages/shared/types"),
      "@quikit/shared": path.resolve(__dirname, "../../packages/shared"),
    },
  },
});
