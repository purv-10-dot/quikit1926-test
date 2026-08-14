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
    exclude: ["__tests__/e2e/**", "__tests__/integration/**", "node_modules/**"],
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
      // The app lives at apps/quikcrmexpress, so the workspace packages are two
      // levels up — matching quikscale/quiktrack/quikinfra/quikasset.
      //
      // These previously pointed at ./packages/*, i.e. apps/quikcrmexpress/packages/*,
      // which does not exist. The stale comment claimed "this app sits at the
      // repo root in this checkout" — true of the standalone repo it was ported
      // from, false here. Tests only passed because resolution silently fell
      // through to the node_modules/@quikit/* workspace symlinks.
      //
      // Subpath aliases must precede the bare package alias so they win the
      // prefix match (same ordering rule as quiktrack/vitest.config.ts).
      "@quikit/database": path.resolve(__dirname, "../../packages/database"),
      "@quikit/auth": path.resolve(__dirname, "../../packages/auth"),
      // "@quikit/ui/support" MUST precede the bare "@quikit/ui" entry — Vite
      // matches in order, and the bare alias would rewrite it to a
      // non-existent packages/ui/support.
      "@quikit/ui/support": path.resolve(__dirname, "../../packages/ui/components/support"),
      "@quikit/ui": path.resolve(__dirname, "../../packages/ui"),
      "@quikit/shared/moduleRegistry": path.resolve(__dirname, "../../packages/shared/lib/moduleRegistry"),
      "@quikit/shared/rateLimit": path.resolve(__dirname, "../../packages/shared/lib/rateLimit"),
      "@quikit/shared/pagination": path.resolve(__dirname, "../../packages/shared/lib/pagination"),
      "@quikit/shared/sso-domain-server": path.resolve(__dirname, "../../packages/shared/lib/sso-domain-server"),
      "@quikit/shared/login-url": path.resolve(__dirname, "../../packages/shared/lib/login-url"),
      "@quikit/shared/temp-password": path.resolve(__dirname, "../../packages/shared/lib/temp-password"),
      "@quikit/shared/constants": path.resolve(__dirname, "../../packages/shared/lib/constants"),
      "@quikit/shared/email": path.resolve(__dirname, "../../packages/shared/lib/email"),
      "@quikit/shared": path.resolve(__dirname, "../../packages/shared"),
    },
  },
});
