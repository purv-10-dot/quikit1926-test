import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARD TEST — protects the QuikTest module's core guarantee.
 *
 * `QtTestResult` is append-only, and that is enforced by a Postgres trigger.
 * Prisma cannot express triggers: `prisma migrate diff` will not reproduce it,
 * and a `prisma db push` against the shared schema would silently drop it,
 * leaving the module happily rewriting history with no visible error anywhere.
 *
 * This test fails loudly if the migration that installs the trigger is deleted,
 * renamed, or edited to remove the guarantee — so the failure surfaces in CI
 * rather than in an audit six months later.
 *
 * It is deliberately a STATIC check of the migration file, not a live database
 * assertion: this suite runs in a node environment with Prisma mocked and no
 * DB connection (see vitest.config.ts). The live-database version of these
 * assertions is exercised when the migration is applied — it verifies that
 * UPDATE and DELETE are actually refused, that a correction still appends, and
 * that FK cascade cannot bypass the trigger.
 */

const MIGRATION = path.resolve(
  __dirname,
  "../../../../packages/database/prisma/migrations/20260807120000_quiktest_test_management/migration.sql",
);

function migrationSql(): string {
  try {
    return readFileSync(MIGRATION, "utf8");
  } catch {
    throw new Error(
      `The QuikTest migration is missing from ${MIGRATION}.\n` +
        "It carries the append-only trigger, the partial unique indexes and the " +
        "refId allocator — none of which Prisma can regenerate. Restore it from " +
        "git history; do not recreate the tables with `db push` alone.",
    );
  }
}

describe("QuikTest append-only guarantee", () => {
  const sql = migrationSql();

  it("defines the trigger function that refuses mutation", () => {
    expect(sql).toContain("qt_test_result_append_only");
    expect(sql).toMatch(/RAISE\s+EXCEPTION/i);
  });

  it("installs a BEFORE UPDATE OR DELETE trigger on QtTestResult", () => {
    expect(sql).toMatch(
      /CREATE TRIGGER "qt_test_result_no_mutate"[\s\S]*?BEFORE UPDATE OR DELETE ON app_quiktrack\."QtTestResult"/,
    );
  });

  it("covers per-step results with the same trigger", () => {
    expect(sql).toMatch(
      /CREATE TRIGGER "qt_test_step_result_no_mutate"[\s\S]*?BEFORE UPDATE OR DELETE ON app_quiktrack\."QtTestStepResult"/,
    );
  });

  it("fires per row, so a multi-row UPDATE cannot slip through", () => {
    // A statement-level trigger would not see individual rows; both triggers
    // must be FOR EACH ROW.
    const perRow = sql.match(/FOR EACH ROW EXECUTE FUNCTION app_quiktrack\.qt_test_result_append_only/g);
    expect(perRow).toHaveLength(2);
  });

  it("exposes no UPDATE or DELETE statement against the result tables", () => {
    // The migration itself must never mutate the trail — if it did, the trigger
    // would block its own migration, and more importantly it would mean someone
    // added a corrective UPDATE instead of an appended row.
    expect(sql).not.toMatch(/UPDATE\s+app_quiktrack\."QtTestResult"/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+app_quiktrack\."QtTestResult"/i);
  });
});

describe("QuikTest indexes Prisma cannot express", () => {
  const sql = migrationSql();

  it("keeps automationId unique per project only where present", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[^;]*"QtTestCase_projectId_automationId_uniq"[\s\S]*?WHERE "automationId" IS NOT NULL/,
    );
  });

  it("makes CI find-or-create idempotent via a partial unique on build", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[^;]*"QtTestRun_projectId_build_uniq"[\s\S]*?WHERE "build" IS NOT NULL/,
    );
  });

  it("allows exactly one default status per org", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[^;]*"QtTestStatus_orgId_default_uniq"[\s\S]*?WHERE "isDefault" = true/,
    );
  });

  it("guards duplicate (run, case) when no configuration is set", () => {
    // Postgres treats NULLs as distinct in a plain unique index, so the
    // three-column unique alone would let the same case be materialised twice.
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[^;]*"QtTest_runId_caseId_noconfig_uniq"[\s\S]*?WHERE "configId" IS NULL/,
    );
  });

  it("allocates refIds from a counter rather than MAX()+1", () => {
    // MAX(refId)+1 races under concurrent CI writes; the counter row locks.
    expect(sql).toContain("qt_test_next_ref");
    expect(sql).not.toMatch(/MAX\(\s*"refId"\s*\)/i);
  });
});

describe("QuikTest schema is additive", () => {
  it("alters no existing table", () => {
    const sql = migrationSql();
    const alters = sql.match(/ALTER TABLE\s+app_quiktrack\."(\w+)"/g) ?? [];
    // Only QtTest* tables may be altered (the self-referencing CHECK
    // constraint). Touching QtIssue/QtProject/etc. would make this migration
    // non-additive and unsafe to hand-apply to prod.
    const foreign = alters.filter((a) => !/"QtTest/.test(a));
    expect(foreign).toEqual([]);
  });

  it("adds no foreign key onto QtIssue", () => {
    // Coverage and defect links hold issue ids WITHOUT an FK, so closing or
    // deleting a Bug can never cascade into — or rewrite — historical results.
    const sql = migrationSql();
    expect(sql).not.toMatch(/REFERENCES\s+app_quiktrack\."QtIssue"/);
  });
});
