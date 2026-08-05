import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Vitest 3 + Vite 5 — runs on Node 20.14+ (no Rolldown / Vitest 4 native bindings).
// Other monorepo apps may use Vitest 4; quikchat is pinned via root package.json overrides.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: [
      "node_modules/**",
      ".next/**",
      "e2e/**",
      // 30 DB-backed integration tests, excluded from `npm run test`. They all
      // query a real Postgres via `db` from "@quikit/database" against fixture
      // rows (org "acme"/"globex", users alice/bob/carol@*.test, etc.) that no
      // seed script currently creates. Blocked on a decision for how CI's
      // `check` job (no Postgres service today — see .github/workflows/ci.yml)
      // gets a database before any of these can be re-enabled.
      "app/api/calls/group/route.test.ts",
      "app/api/calls/route.test.ts",
      "app/api/calls/[id]/token/route.test.ts",
      "app/api/calls/[id]/participants/[identity]/route.test.ts",
      "app/api/calls/[id]/mute-all/route.test.ts",
      "app/api/livekit/webhook/route.test.ts",
      "app/api/channels/[id]/assist/route.test.ts",
      "app/api/channels/[id]/ingest/route.test.ts",
      "app/api/channels/[id]/kb-docs/route.test.ts",
      "app/api/channels/ai/route.test.ts",
      "app/api/channels/route.test.ts",
      "app/api/notifications/routes.test.ts",
      "app/api/uploads/sign/route.test.ts",
      "lib/server/calendar-events.service.test.ts",
      "lib/server/calendar.service.test.ts",
      "lib/server/calendar/microsoft.test.ts",
      "lib/server/calling/calling.service.test.ts",
      "lib/server/calling/timeout-sweep.test.ts",
      "lib/server/channels.service.test.ts",
      "lib/server/delivered-event.test.ts",
      "lib/server/internal.service.test.ts",
      "lib/server/invite-accept.test.ts",
      "lib/server/media-serialize.test.ts",
      "lib/server/message-index.test.ts",
      "lib/server/messages.service.test.ts",
      "lib/server/notifications.service.test.ts",
      "lib/server/rate-limit-gate.test.ts",
      "lib/server/read-event.test.ts",
      "lib/server/ui-prefs.test.ts",
      "lib/server/users.service.test.ts",
    ],
    fileParallelism: false,
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["app/**", "lib/**", "components/**"],
      exclude: ["**/*.d.ts", "**/*.test.{ts,tsx}", "**/node_modules/**"],
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
