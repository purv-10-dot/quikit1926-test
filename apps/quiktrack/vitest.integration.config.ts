/**
 * DB-integration harness — a SECOND vitest project, deliberately separate from
 * `vitest.config.ts`.
 *
 * The default suite deep-mocks Prisma (`__tests__/helpers/mockDb.ts`), so every
 * claim it makes about database behaviour is control flow reading a mock. This
 * config runs a small number of tests against the real local Postgres instead.
 * It is NOT part of `npm run test` — `vitest.config.ts` excludes
 * `__tests__/integration/**` so CI, which has no database, stays green.
 *
 *   npm run test             # mocked, no database, runs everywhere
 *   npm run test:integration # real database, local only
 *
 * ── NO RESET BETWEEN TESTS (deliberate) ───────────────────────────────────
 * There is no truncate, no per-test transaction rollback, and no restore of a
 * baseline dump. The suite seeds its fixture ONCE in `beforeAll` (via the
 * idempotent `seed-permissions-demo.ts`) and every test after that is
 * read-only.
 *
 * This is a choice, not an omission. Resetting would mean owning tables the
 * app's own seeders also write — `AppRole`, `RolePermission`, `OrgMember` — on
 * a database that holds a developer's live local demo data. A harness that
 * truncates those would destroy work between runs, and one that wrapped each
 * test in a rollback transaction could not use the app's own `db` singleton
 * (`@/lib/db`), which is the thing under test. Read-only tests over an
 * idempotent fixture get the same isolation guarantee for none of that cost.
 *
 * The constraint this places on anyone adding tests here: **integration tests
 * must not write.** If a future test needs to mutate, it owns its own rows and
 * cleans them up itself — do not reach for a global reset.
 *
 * `fileParallelism: false` because the fixture is shared process-wide; two
 * files seeding concurrently would race on the same upserts.
 */
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import baseConfig from "./vitest.config";

// The app's own .env.local is the only place the local DATABASE_URL lives.
// `loadEnv` with an empty prefix is vite's own dotenv parser — no extra
// dependency, and it handles quoting the way Next.js does.
const env = loadEnv("test", __dirname, "");

// `plugins` and `resolve` are borrowed from the base config (the alias table is
// long and must not drift), but `test` is REPLACED rather than merged.
// `mergeConfig` concatenates arrays, which would append this file's `include`
// to the base's and run the entire unit suite against the database.
export default defineConfig({
  plugins: baseConfig.plugins,
  resolve: baseConfig.resolve,
  test: {
    environment: "node",
    include: ["__tests__/integration/**/*.test.ts"],
    exclude: ["node_modules/**"],
    // Deliberately no setupFiles: the unit suite's setup mocks next-auth and
    // replaces global fetch. Nothing here needs either, and a mocked fetch
    // would be a trap in a suite whose whole point is being real.
    env: {
      DATABASE_URL: env.DATABASE_URL,
      DATABASE_URL_DIRECT: env.DATABASE_URL_DIRECT,
      INTERNAL_AI_RUNTIME_SECRET: env.INTERNAL_AI_RUNTIME_SECRET,
    },
    fileParallelism: false,
    // Seeding plus real round-trips to Postgres; the 5s default is tight.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
