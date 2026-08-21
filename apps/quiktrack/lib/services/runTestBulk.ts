import { db } from "@/lib/db";

/**
 * Bulk actions for the runner grid's selection toolbar (QUIKTR-341): Assign To,
 * Add Results (set status), Add Label, and Remove from run.
 *
 * Follows the same shape as lib/services/testDelete.ts — `affected` + `skipped`
 * with a reason per skip, never a silent partial success.
 */

export class RunTestBulkError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "RunTestBulkError";
    this.status = status;
  }
}

export interface BulkOutcome {
  affected: string[];
  skipped: Array<{ id: string; reason: string }>;
}

const MAX_BULK = 500;

function assertBatch(ids: string[]) {
  if (ids.length === 0) throw new RunTestBulkError("No tests selected.");
  if (ids.length > MAX_BULK) {
    throw new RunTestBulkError(`Too many tests at once (${ids.length}). Select up to ${MAX_BULK}.`);
  }
}

/** Every test id in `ids` that actually belongs to this run+org. */
async function scopedIds(orgId: string, runId: string, ids: string[]): Promise<Set<string>> {
  const rows = await db.qtTest.findMany({
    where: { id: { in: ids }, orgId, runId },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

/** Bulk reassign — same PATCH the per-row AssigneePicker already uses, just N at once. */
export async function bulkAssign(
  orgId: string,
  runId: string,
  ids: string[],
  assigneeId: string | null,
): Promise<BulkOutcome> {
  const unique = [...new Set(ids)];
  assertBatch(unique);
  const valid = await scopedIds(orgId, runId, unique);

  const skipped: BulkOutcome["skipped"] = [];
  const target: string[] = [];
  for (const id of unique) {
    if (valid.has(id)) target.push(id);
    else skipped.push({ id, reason: "Not found in this run." });
  }

  if (target.length > 0) {
    await db.qtTest.updateMany({
      where: { id: { in: target }, orgId, runId },
      data: { assigneeId },
    });
  }
  return { affected: target, skipped };
}

/**
 * Bulk status change — appends ONE QtTestResult per selected test, same as
 * recording a result on a single row. Never a bulk UPDATE on `currentStatusId`
 * directly: the append-only trail is the source of truth for every status
 * change, one at a time or many.
 */
export async function bulkSetStatus(
  orgId: string,
  runId: string,
  userId: string,
  ids: string[],
  statusId: string,
): Promise<BulkOutcome> {
  const unique = [...new Set(ids)];
  assertBatch(unique);

  const status = await db.qtTestStatus.findFirst({
    where: { id: statusId, orgId, isDeleted: false },
    select: { id: true },
  });
  if (!status) throw new RunTestBulkError("That status no longer exists.", 404);

  const tests = await db.qtTest.findMany({
    where: { id: { in: unique }, orgId, runId },
    select: { id: true },
  });
  const valid = new Set(tests.map((t) => t.id));

  const skipped: BulkOutcome["skipped"] = [];
  const target: string[] = [];
  for (const id of unique) {
    if (valid.has(id)) target.push(id);
    else skipped.push({ id, reason: "Not found in this run." });
  }

  for (const testId of target) {
    await db.$transaction([
      db.qtTestResult.create({
        data: {
          orgId,
          testId,
          runId,
          statusId,
          source: "manual",
          executedBy: userId,
        },
      }),
      db.qtTest.update({ where: { id: testId }, data: { currentStatusId: statusId } }),
    ]);
  }

  return { affected: target, skipped };
}

/** Bulk label attach — same POST /api/test/cases/{id}/tags the LabelPicker uses,
 *  applied to every case behind the selected tests. Labels are case-level, so
 *  attaching one label to N tests actually touches (up to) N distinct cases. */
export async function bulkAddLabel(
  orgId: string,
  runId: string,
  userId: string,
  ids: string[],
  tagId: string,
): Promise<BulkOutcome> {
  const unique = [...new Set(ids)];
  assertBatch(unique);

  const tag = await db.qtTestTag.findFirst({ where: { id: tagId, orgId }, select: { id: true } });
  if (!tag) throw new RunTestBulkError("That label no longer exists.", 404);

  const tests = await db.qtTest.findMany({
    where: { id: { in: unique }, orgId, runId },
    select: { id: true, caseId: true },
  });
  const byId = new Map(tests.map((t) => [t.id, t.caseId]));

  const skipped: BulkOutcome["skipped"] = [];
  const target: string[] = [];
  const caseIds = new Set<string>();
  for (const id of unique) {
    const caseId = byId.get(id);
    if (!caseId) {
      skipped.push({ id, reason: "Not found in this run." });
      continue;
    }
    target.push(id);
    caseIds.add(caseId);
  }

  for (const caseId of caseIds) {
    await db.qtTestCaseTag.upsert({
      where: { caseId_tagId: { caseId, tagId } },
      create: { orgId, caseId, tagId },
      // Idempotent — a case that already carries the label is a no-op, not an
      // error, same as the single-case attach endpoint.
      update: {},
    });
  }

  return { affected: target, skipped };
}

/**
 * Removes tests from a run — a HARD delete, gated to tests that have never had a
 * result recorded (`currentStatus.key === "untested"`... actually checked via a
 * results count, since a status could theoretically be reset without deleting
 * results). A test with any recorded result cannot be removed: `QtTestResult` is
 * append-only by database trigger, and a naive cascade would violate it anyway —
 * this check exists so the failure is a clear, per-row skip reason instead of a
 * raw trigger error surfacing from a bulk statement.
 */
export async function bulkRemoveFromRun(
  orgId: string,
  runId: string,
  ids: string[],
): Promise<BulkOutcome> {
  const unique = [...new Set(ids)];
  assertBatch(unique);

  const tests = await db.qtTest.findMany({
    where: { id: { in: unique }, orgId, runId },
    select: { id: true, _count: { select: { results: true } } },
  });
  const byId = new Map(tests.map((t) => [t.id, t]));

  const skipped: BulkOutcome["skipped"] = [];
  const target: string[] = [];
  for (const id of unique) {
    const row = byId.get(id);
    if (!row) {
      skipped.push({ id, reason: "Not found in this run." });
    } else if (row._count.results > 0) {
      skipped.push({ id, reason: "Has recorded results and cannot be removed." });
    } else {
      target.push(id);
    }
  }

  if (target.length > 0) {
    await db.qtTest.deleteMany({ where: { id: { in: target }, orgId, runId } });
  }

  return { affected: target, skipped };
}
