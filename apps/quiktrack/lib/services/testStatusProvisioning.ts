import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { TEST_TEMPLATE_SEED } from "@/lib/test/caseLayout";
import { TEST_STATUS_SEED } from "@/lib/test/statuses";

/**
 * Provisions the org's test-status catalogue.
 *
 * WHY THIS EXISTS. The nine statuses were seeded by
 * `20260807120000_quiktest_test_management/migration.sql` with a
 * `CROSS JOIN quikit."Org"` — a one-shot backfill over the orgs that existed when
 * the migration ran. Any org created afterwards had none, and the first attempt to
 * create a test run failed with:
 *
 *     No default test status is configured for this organisation.
 *
 * A fixed vocabulary that a QA lead cannot create for themselves is not a
 * configuration choice — it is a provisioning gap. This closes it, so no
 * organisation can be in that state.
 *
 * Called from project creation (every route into QuikTest goes through a project,
 * so this runs before anything can need a status) and as a backstop when a run is
 * created, which covers orgs whose projects all predate the change.
 */

/** Statuses that must exist, keyed for quick diffing. */
const SEED_BY_KEY = new Map(TEST_STATUS_SEED.map((s) => [s.key, s]));

export interface EnsureResult {
  /** Keys inserted by this call. Empty when the org was already complete. */
  created: string[];
  /** True when nothing needed doing — the common case. */
  alreadyComplete: boolean;
}

/**
 * Creates any missing status rows for `orgId`. Idempotent and safe to call
 * concurrently.
 *
 * Only fills GAPS: an existing row is never updated, so an org that has renamed
 * "Blocked" to "On hold" keeps its label. That also makes this usable as the
 * settings screen's "Restore missing defaults" repair action.
 */
export async function ensureTestStatuses(orgId: string): Promise<EnsureResult> {
  const existing = await db.qtTestStatus.findMany({
    where: { orgId },
    select: { key: true, isDefault: true, isDeleted: true },
  });

  // Deliberately counts soft-deleted rows as present: the unique index is on
  // (orgId, key) and does NOT exclude isDeleted, so re-inserting a soft-deleted
  // key would throw. Restoring one is an un-delete, not an insert — a different
  // action, and not this function's job.
  const have = new Set(existing.map((s) => s.key));
  const missing = TEST_STATUS_SEED.filter((s) => !have.has(s.key));

  if (missing.length === 0) {
    return { created: [], alreadyComplete: true };
  }

  // A partial unique index (`QtTestStatus_orgId_default_uniq`) allows exactly ONE
  // default per org. If the org already has a default — e.g. it kept `untested`
  // but lost others — inserting our default row would violate it, so that flag is
  // dropped for this insert. The org keeps the default it already has.
  const hasDefault = existing.some((s) => s.isDefault);

  const data = missing.map((s) => ({
    // Same deterministic id shape the migration used, so a row provisioned here is
    // indistinguishable from a seeded one.
    id: `qts_${orgId}_${s.key}`,
    orgId,
    key: s.key,
    label: s.label,
    color: s.color,
    isFinal: s.isFinal,
    isDefault: hasDefault ? false : s.isDefault,
    isAutomation: s.isAutomation,
    orderNo: s.orderNo,
  }));

  // skipDuplicates makes a concurrent call a no-op rather than a unique violation:
  // two projects created at the same moment both reach this, and neither should
  // fail.
  const result = await db.qtTestStatus.createMany({ data, skipDuplicates: true });

  return {
    created: result.count > 0 ? missing.map((s) => s.key) : [],
    alreadyComplete: false,
  };
}

/**
 * Best-effort variant for call sites where provisioning must never be the reason
 * the surrounding operation fails — e.g. project creation. A project without test
 * statuses is still a usable project, and the run-creation backstop will fix it.
 */
export async function ensureTestStatusesQuietly(orgId: string): Promise<void> {
  try {
    await ensureTestStatuses(orgId);
  } catch (error: unknown) {
    // Swallowed deliberately, but not silently: a unique violation here is the
    // expected concurrent-create race and is harmless. Anything else is worth
    // knowing about, so it is surfaced in the server log rather than discarded.
    if (
      !(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
    ) {
      // eslint-disable-next-line no-console
      console.error("[quiktest] ensureTestStatuses failed for org", orgId, error);
    }
  }
}

/**
 * Transaction-scoped variant, for callers already inside one — notably
 * `seedProjectDefaults`, which seeds every other per-project default in a single
 * transaction and should not open a second connection for this.
 *
 * Same gap-filling rules as `ensureTestStatuses`. `skipDuplicates` keeps a
 * concurrent project creation from aborting the surrounding transaction.
 */
export async function ensureTestStatusesTx(
  tx: Prisma.TransactionClient,
  orgId: string,
): Promise<void> {
  const existing = await tx.qtTestStatus.findMany({
    where: { orgId },
    select: { key: true, isDefault: true },
  });
  const have = new Set(existing.map((s) => s.key));
  const missing = TEST_STATUS_SEED.filter((s) => !have.has(s.key));
  if (missing.length === 0) return;

  // See ensureTestStatuses: only one default is permitted per org by a partial
  // unique index, so never add a second.
  const hasDefault = existing.some((s) => s.isDefault);

  await tx.qtTestStatus.createMany({
    data: missing.map((s) => ({
      id: `qts_${orgId}_${s.key}`,
      orgId,
      key: s.key,
      label: s.label,
      color: s.color,
      isFinal: s.isFinal,
      isDefault: hasDefault ? false : s.isDefault,
      isAutomation: s.isAutomation,
      orderNo: s.orderNo,
    })),
    skipDuplicates: true,
  });
}

/** Which seeded keys an org is missing, without writing anything. */
export async function missingTestStatusKeys(orgId: string): Promise<string[]> {
  const existing = await db.qtTestStatus.findMany({
    where: { orgId },
    select: { key: true },
  });
  const have = new Set(existing.map((s) => s.key));
  return [...SEED_BY_KEY.keys()].filter((k) => !have.has(k));
}

// ── Case templates ──────────────────────────────────────────────────────────
//
// Same failure, one table over: the parity migration seeded QtTestTemplate with a
// CROSS JOIN over then-existing orgs, so a later org had none and the editor's
// Template dropdown showed "No options". That one degrades QUIETLY — the form falls
// back to STEPS — so instead of an error you silently lose the TEXT / BDD /
// Exploratory layouts.

/**
 * Creates any missing org-wide templates for `orgId`. Idempotent.
 *
 * Scoped to `projectId: null` throughout: those are the org-wide templates the
 * editor offers, and the partial unique index for the default
 * (`QtTestTemplate_orgId_default_uniq`) only applies where `projectId IS NULL`.
 * A project-specific template is a different thing and is left alone.
 */
export async function ensureTestTemplates(orgId: string): Promise<EnsureResult> {
  const existing = await db.qtTestTemplate.findMany({
    where: { orgId, projectId: null },
    select: { kind: true, isDefault: true, isDeleted: true },
  });

  const have = new Set(existing.map((t) => t.kind));
  const missing = TEST_TEMPLATE_SEED.filter((t) => !have.has(t.kind));

  if (missing.length === 0) {
    return { created: [], alreadyComplete: true };
  }

  // The default index excludes soft-deleted rows, so only a LIVE default blocks
  // ours — unlike the status index, which counts every row.
  const hasLiveDefault = existing.some((t) => t.isDefault && !t.isDeleted);

  const data = missing.map((t) => ({
    // Same deterministic id shape the migration used, so a provisioned row is
    // indistinguishable from a seeded one — and re-running is a genuine no-op.
    id: `qtt_${orgId}_${t.kind}`,
    orgId,
    projectId: null,
    name: t.name,
    kind: t.kind,
    isDefault: hasLiveDefault ? false : t.isDefault,
  }));

  const result = await db.qtTestTemplate.createMany({ data, skipDuplicates: true });

  return {
    created: result.count > 0 ? missing.map((t) => t.kind) : [],
    alreadyComplete: false,
  };
}

/** Transaction-scoped variant, for `seedProjectDefaults`. */
export async function ensureTestTemplatesTx(
  tx: Prisma.TransactionClient,
  orgId: string,
): Promise<void> {
  const existing = await tx.qtTestTemplate.findMany({
    where: { orgId, projectId: null },
    select: { kind: true, isDefault: true, isDeleted: true },
  });
  const have = new Set(existing.map((t) => t.kind));
  const missing = TEST_TEMPLATE_SEED.filter((t) => !have.has(t.kind));
  if (missing.length === 0) return;

  const hasLiveDefault = existing.some((t) => t.isDefault && !t.isDeleted);

  await tx.qtTestTemplate.createMany({
    data: missing.map((t) => ({
      id: `qtt_${orgId}_${t.kind}`,
      orgId,
      projectId: null,
      name: t.name,
      kind: t.kind,
      isDefault: hasLiveDefault ? false : t.isDefault,
    })),
    skipDuplicates: true,
  });
}

/** Which template kinds an org is missing, without writing anything. */
export async function missingTemplateKinds(orgId: string): Promise<string[]> {
  const existing = await db.qtTestTemplate.findMany({
    where: { orgId, projectId: null },
    select: { kind: true },
  });
  const have = new Set(existing.map((t) => t.kind));
  return TEST_TEMPLATE_SEED.filter((t) => !have.has(t.kind)).map((t) => t.kind);
}

/**
 * Everything QuikTest needs an org to have. Best-effort: a project without these is
 * still a usable project, and the run/editor backstops will fill them in.
 */
export async function ensureQuikTestOrgDefaultsQuietly(orgId: string): Promise<void> {
  await Promise.all([
    ensureTestStatusesQuietly(orgId),
    ensureTestTemplates(orgId).catch((error: unknown) => {
      if (
        !(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
      ) {
        // eslint-disable-next-line no-console
        console.error("[quiktest] ensureTestTemplates failed for org", orgId, error);
      }
    }),
  ]);
}
