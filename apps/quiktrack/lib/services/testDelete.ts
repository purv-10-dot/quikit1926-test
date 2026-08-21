import { db } from "@/lib/db";
import { assertResolvedProjectId } from "@/lib/test/projectId";

/**
 * Soft-delete and restore for test cases and test runs.
 *
 * SOFT DELETE ONLY — nothing here ever issues a hard DELETE, for two reasons:
 *
 *  1. A case may be referenced by `QtTest` rows in historical runs. Removing it
 *     would orphan a result trail that is meant to be permanent.
 *  2. `QtTestResult` is append-only by database trigger. A hard delete of a run
 *     cascades to its results, which the trigger REFUSES — so the statement would
 *     fail anyway. Soft delete is not a stylistic preference here; it is the only
 *     thing the schema permits.
 *
 * Everything is scoped by `orgId` AND `projectId`, so an id from another project
 * cannot be deleted by guessing it.
 */

export class TestDeleteError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TestDeleteError";
    this.status = status;
  }
}

export interface BulkResult {
  /** Ids that changed state. */
  affected: string[];
  /** Ids that were skipped, with why — never silently dropped. */
  skipped: Array<{ id: string; reason: string }>;
}

/** Hard cap per request: keeps one transaction bounded against a remote DB. */
const MAX_BULK = 500;

function assertBatch(ids: string[]) {
  if (ids.length === 0) {
    throw new TestDeleteError("No items selected.");
  }
  if (ids.length > MAX_BULK) {
    throw new TestDeleteError(
      `Too many items at once (${ids.length}). Select up to ${MAX_BULK}.`,
    );
  }
}

// ── Test cases ──────────────────────────────────────────────────────────────

/**
 * Soft-deletes cases. Idempotent: an already-deleted id is reported as skipped
 * rather than counted, so the summary reflects what actually changed.
 */
export async function deleteTestCases(
  orgId: string,
  projectId: string,
  userId: string,
  ids: string[],
): Promise<BulkResult> {
  assertResolvedProjectId(projectId);
  assertBatch(ids);

  const unique = [...new Set(ids)];

  // Fetch first so the summary can distinguish "not in this project" from
  // "already deleted" — two different things a user needs told apart.
  const found = await db.qtTestCase.findMany({
    where: { id: { in: unique }, orgId, projectId },
    select: { id: true, isDeleted: true },
  });
  const byId = new Map(found.map((c) => [c.id, c]));

  const skipped: BulkResult["skipped"] = [];
  const target: string[] = [];

  for (const id of unique) {
    const row = byId.get(id);
    if (!row) {
      skipped.push({ id, reason: "Not found in this project." });
    } else if (row.isDeleted) {
      skipped.push({ id, reason: "Already deleted." });
    } else {
      target.push(id);
    }
  }

  if (target.length > 0) {
    await db.qtTestCase.updateMany({
      where: { id: { in: target }, orgId, projectId },
      data: { isDeleted: true, updatedBy: userId },
    });
  }

  return { affected: target, skipped };
}

/**
 * Restores soft-deleted cases.
 *
 * A case's SECTION may itself have been deleted since. Restoring the case then
 * leaves it invisible — present in the DB but in no folder the tree renders. That
 * is reported as a skip rather than silently producing an unreachable row.
 */
export async function restoreTestCases(
  orgId: string,
  projectId: string,
  userId: string,
  ids: string[],
): Promise<BulkResult> {
  assertResolvedProjectId(projectId);
  assertBatch(ids);

  const unique = [...new Set(ids)];

  const found = await db.qtTestCase.findMany({
    where: { id: { in: unique }, orgId, projectId },
    select: {
      id: true,
      isDeleted: true,
      section: { select: { id: true, isDeleted: true } },
    },
  });
  const byId = new Map(found.map((c) => [c.id, c]));

  const skipped: BulkResult["skipped"] = [];
  const target: string[] = [];

  for (const id of unique) {
    const row = byId.get(id);
    if (!row) {
      skipped.push({ id, reason: "Not found in this project." });
    } else if (!row.isDeleted) {
      skipped.push({ id, reason: "Not deleted." });
    } else if (!row.section || row.section.isDeleted) {
      skipped.push({
        id,
        reason: "Its folder was deleted — restore the folder first.",
      });
    } else {
      target.push(id);
    }
  }

  if (target.length > 0) {
    await db.qtTestCase.updateMany({
      where: { id: { in: target }, orgId, projectId },
      data: { isDeleted: false, updatedBy: userId },
    });
  }

  return { affected: target, skipped };
}

// ── Test runs ───────────────────────────────────────────────────────────────

/**
 * Soft-deletes runs. Results are KEPT — the owner's explicit choice, and the only
 * option the append-only trigger allows.
 *
 * Returns a per-run result count so the confirmation can say what is being hidden
 * rather than asking for a blind yes.
 */
export async function deleteTestRuns(
  orgId: string,
  projectId: string,
  ids: string[],
): Promise<BulkResult & { keptResults: number }> {
  assertResolvedProjectId(projectId);
  assertBatch(ids);

  const unique = [...new Set(ids)];

  const found = await db.qtTestRun.findMany({
    where: { id: { in: unique }, orgId, projectId },
    select: { id: true, isDeleted: true, _count: { select: { results: true } } },
  });
  const byId = new Map(found.map((r) => [r.id, r]));

  const skipped: BulkResult["skipped"] = [];
  const target: string[] = [];
  let keptResults = 0;

  for (const id of unique) {
    const row = byId.get(id);
    if (!row) {
      skipped.push({ id, reason: "Not found in this project." });
    } else if (row.isDeleted) {
      skipped.push({ id, reason: "Already deleted." });
    } else {
      target.push(id);
      keptResults += row._count.results;
    }
  }

  if (target.length > 0) {
    await db.qtTestRun.updateMany({
      where: { id: { in: target }, orgId, projectId },
      data: { isDeleted: true },
    });
  }

  return { affected: target, skipped, keptResults };
}

export async function restoreTestRuns(
  orgId: string,
  projectId: string,
  ids: string[],
): Promise<BulkResult> {
  assertResolvedProjectId(projectId);
  assertBatch(ids);

  const unique = [...new Set(ids)];

  const found = await db.qtTestRun.findMany({
    where: { id: { in: unique }, orgId, projectId },
    select: { id: true, isDeleted: true },
  });
  const byId = new Map(found.map((r) => [r.id, r]));

  const skipped: BulkResult["skipped"] = [];
  const target: string[] = [];

  for (const id of unique) {
    const row = byId.get(id);
    if (!row) skipped.push({ id, reason: "Not found in this project." });
    else if (!row.isDeleted) skipped.push({ id, reason: "Not deleted." });
    else target.push(id);
  }

  if (target.length > 0) {
    await db.qtTestRun.updateMany({
      where: { id: { in: target }, orgId, projectId },
      data: { isDeleted: false },
    });
  }

  return { affected: target, skipped };
}
