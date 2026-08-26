import { existsSync, readFileSync } from "fs";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Plain prefix aliases (further below) map `@quikit/<pkg>` straight at that
 * package's source directory, bypassing its package.json `exports` map
 * entirely. That's fine for a bare `@quikit/ui` import, but a subpath import
 * like `@quikit/ui/support` then resolves against `packages/ui/support`
 * (doesn't exist) instead of the exports map's real
 * `./components/support/index.ts` — silently, under Vitest only (webpack/Next
 * honor `exports` natively, so the app build is unaffected). This already
 * broke twice from one merge (`@quikit/ui/support`, `@quikit/shared/supportContent`).
 *
 * Tried a separate `enforce: "pre"` plugin with a `resolveId` hook first —
 * it never fired. Vite's `resolve.alias` is handled by its own internal
 * alias plugin, which runs before ANY user plugin regardless of `enforce`;
 * the prefix alias below wins the specifier before a sibling plugin ever
 * sees it. The supported extension point for "resolve this alias dynamically"
 * is an alias entry's own `customResolver` — so this reads the real `exports`
 * map and hands back the correct file, participating in the SAME ordered
 * alias list instead of racing it from outside.
 */
function resolveQuikitSubpath(source: string): string | null {
  const m = /^@quikit\/([^/]+)\/(.+)$/.exec(source);
  if (!m) return null;
  const [, pkgName, subpath] = m;
  const pkgDir = path.resolve(__dirname, "../../packages", pkgName as string);
  const pkgJsonPath = path.join(pkgDir, "package.json");
  if (!existsSync(pkgJsonPath)) return null;
  let raw: { exports?: Record<string, unknown> };
  try {
    raw = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  } catch {
    return null;
  }
  const entry = raw.exports?.[`./${subpath}`];
  const target =
    typeof entry === "string"
      ? entry
      : ((entry as Record<string, string> | undefined)?.import ??
        (entry as Record<string, string> | undefined)?.default);
  if (typeof target !== "string") return null; // not in the exports map
  const resolved = path.resolve(pkgDir, target);
  return existsSync(resolved) ? resolved : null;
}

/**
 * Vite counterpart to the `asset/source` webpack rule in next.config.js: makes
 * `import spec from "…/openapi.yaml"` hand back the file's raw text under
 * Vitest too. Without it, Vite has no loader for `.yaml` and any test that
 * reaches the /api-docs spec module fails to resolve it.
 *
 * `enforce: "pre"` so this claims the .yaml id before Vite's default pipeline
 * tries to parse it as JS.
 */
function yamlRaw() {
  return {
    name: "yaml-raw",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!/\.ya?ml(\?.*)?$/.test(id)) return null;
      return { code: `export default ${JSON.stringify(code)};`, map: null };
    },
  };
}

// Vitest 3 + Vite 5 — runs on Node 20.14+ (no Rolldown / Vitest 4 native bindings).
//
// HOW THE 3.x PIN ACTUALLY WORKS — there is no patch and no override. The root
// `package.json` `overrides` block holds only `react`/`react-dom`; it has never
// mentioned vitest. What pins this app is the ordinary exact
// `"vitest": "3.2.4"` in `apps/quikchat/package.json`: the workspace root hoists
// 4.1.10 for everyone else, npm cannot satisfy 3.2.4 from that, so it nests a
// second copy at `apps/quikchat/node_modules/vitest` and `npm run test` here
// resolves to it. Plain npm nesting, reproducible from the lockfile.
//
// Consequence, and the reason this is worth a comment at all: the nested tree is
// fragile across merges. A branch that bumps the shared deps for the hoisted
// workspaces and not this one leaves the nested copy asking for packages nothing
// else in the tree installs, and the break surfaces as `ERR_MODULE_NOT_FOUND` on
// a transitive dep (`loupe`, `strip-literal`) rather than as a version error. A
// clean `npm ci` repairs it. Aligning both stragglers on 4.x retires the whole
// class — see QUIKCHAT_BACKLOG.md.
export default defineConfig({
  plugins: [react(), yamlRaw()],
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
    alias: [
      { find: "@", replacement: path.resolve(__dirname, ".") },
      { find: "@quikit/database", replacement: path.resolve(__dirname, "../../packages/database") },
      { find: "@quikit/auth", replacement: path.resolve(__dirname, "../../packages/auth") },
      // Any `@quikit/<pkg>/<subpath>` resolves via that package's real
      // exports map — sits above the plain prefix aliases below so it wins
      // the match first, same principle the old per-subpath aliases used.
      {
        find: /^@quikit\/([^/]+)\/(.+)$/,
        replacement: "",
        customResolver: (source: string) => resolveQuikitSubpath(source),
      },
      { find: "@quikit/ui", replacement: path.resolve(__dirname, "../../packages/ui") },
      { find: "@quikit/shared", replacement: path.resolve(__dirname, "../../packages/shared") },
    ],
  },
});
