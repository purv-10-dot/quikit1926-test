import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertResolvedProjectId } from "@/lib/test/projectId";
import type { CreateTestRunInput, RecordResultInput } from "@/lib/validation/testRun";

/**
 * QuikTest — run creation, test materialisation, and the MANUAL WRITE PATH.
 *
 * The result recorder is the most important function in the module: it is one of
 * only two things that write to the append-only trail, and it must keep
 * `QtTest.currentStatusId` in step with the newest result inside the same
 * transaction. Everything else here exists to set that up.
 */

export class TestRunError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "TestRunError";
    this.status = status;
    this.code = code;
  }
}

/** Resolves the org's default status (Untested) for freshly materialised tests. */
async function defaultStatusId(
  tx: Prisma.TransactionClient,
  orgId: string,
): Promise<string> {
  const row = await tx.qtTestStatus.findFirst({
    where: { orgId, isDefault: true, isDeleted: false },
    select: { id: true },
  });
  if (!row) {
    // The migration seeds this for every org, so a miss means the seed did not
    // run for a newer org — surface it rather than silently picking a status.
    throw new TestRunError(
      "No default test status is configured for this organisation.",
      500,
      "NO_DEFAULT_STATUS",
    );
  }
  return row.id;
}

async function nextRefId(
  tx: Prisma.TransactionClient,
  orgId: string,
  projectId: string,
  kind: "case" | "run",
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ n: number }>>`
    SELECT app_quiktrack.qt_test_next_ref(${orgId}, ${projectId}, ${kind}) AS n
  `;
  const n = rows[0]?.n;
  if (typeof n !== "number") throw new Error("refId allocation returned no value");
  return n;
}

/**
 * Creates a run and materialises one test per selected case (× configuration).
 *
 * Each test PINS the case's `currentVersion`, which is what lets a historical
 * run keep showing the steps it actually executed after the case is edited.
 *
 * ⚠️ `input.projectId` MUST be a resolved cuid, never a `projectKey`. Routes take
 * either from the URL/body and resolve via `gateProjectResolved` before calling
 * in. Persisting a key here would write a row that no id-based query can find,
 * and would escape the `(projectId, automationId)` uniqueness index. The guard
 * below fails fast rather than letting that reach the database.
 */
export async function createTestRun(
  orgId: string,
  userId: string,
  input: CreateTestRunInput,
) {
  assertResolvedProjectId(input.projectId);
  // Resolve the case set first — outside the transaction, since it is read-only
  // and can be large.
  const caseWhere: Prisma.QtTestCaseWhereInput = {
    orgId,
    projectId: input.projectId,
    isDeleted: false,
    ...(input.includeDrafts ? {} : { approvalState: { not: "DRAFT" } }),
    ...(input.suiteId
      ? { section: { suiteId: input.suiteId, isDeleted: false } }
      : { id: { in: input.caseIds ?? [] } }),
  };

  const cases = await db.qtTestCase.findMany({
    where: caseWhere,
    select: { id: true, currentVersion: true },
  });

  if (cases.length === 0) {
    if (input.includeDrafts) {
      throw new TestRunError(
        "No test cases matched that selection.",
        400,
        "EMPTY_SELECTION",
      );
    }
    // Distinguish "nothing here at all" from "everything here is still draft".
    // The second is the common case while a suite is being written, and saying
    // so points at the fix (approve them, or tick the box) instead of leaving
    // the user to guess why an apparently full suite produced an empty run.
    //
    // `approvalState` is destructured out rather than set to undefined: Prisma
    // treats an explicit `undefined` as "omit this filter" only for top-level
    // keys, and relying on that is easy to get subtly wrong — removing the key
    // is unambiguous.
    const { approvalState: _excluded, ...withoutApproval } = caseWhere;
    const draftCount = await db.qtTestCase.count({ where: withoutApproval });
    throw new TestRunError(
      draftCount > 0
        ? `All ${draftCount} matching case${draftCount === 1 ? " is" : "s are"} still in Draft or In Review. ` +
            "Approve them on the case, or tick “Include draft cases”."
        : "No test cases matched that selection.",
      400,
      "EMPTY_SELECTION",
    );
  }

  // Config matrix: one test per (case × config) — the plan's §4 decision. With
  // no configs, a single null-config test per case.
  const configIds: Array<string | null> =
    input.configIds && input.configIds.length > 0 ? input.configIds : [null];

  try {
    return await db.$transaction(async (tx) => {
      const statusId = await defaultStatusId(tx, orgId);
      const refId = await nextRefId(tx, orgId, input.projectId, "run");

      const run = await tx.qtTestRun.create({
        data: {
          orgId,
          projectId: input.projectId,
          refId,
          name: input.name,
          description: input.description ?? null,
          source: input.source,
          state: "open",
          build: input.build ?? null,
          environment: input.environment ?? null,
          assigneeId: input.assigneeId ?? null,
          // Date-only strings from the form; stored as timestamps. The DB also
          // enforces endDate >= startDate.
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
          refTickets: input.refTickets ?? null,
          planId: input.planId ?? null,
          suiteId: input.suiteId ?? null,
          milestoneId: input.milestoneId ?? null,
          createdBy: userId,
        },
        select: { id: true, refId: true, name: true },
      });

      if (input.configIds && input.configIds.length > 0) {
        await tx.qtTestRunConfig.createMany({
          data: input.configIds.map((configId) => ({
            orgId,
            runId: run.id,
            configId,
          })),
          skipDuplicates: true,
        });
      }

      // Test refIds are per-run and sequential, so they are assigned from the
      // loop index rather than the project counter (T1..Tn within the run).
      let seq = 0;
      const tests: Prisma.QtTestCreateManyInput[] = [];
      for (const c of cases) {
        for (const configId of configIds) {
          seq += 1;
          tests.push({
            orgId,
            runId: run.id,
            caseId: c.id,
            configId,
            refId: seq,
            caseVersion: c.currentVersion,
            currentStatusId: statusId,
            assigneeId: input.assigneeId ?? null,
          });
        }
      }
      await tx.qtTest.createMany({ data: tests });

      return { ...run, testCount: tests.length };
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // The partial unique on (projectId, build) for automated runs — a CI job
      // re-reporting the same build should find-or-create, not duplicate.
      throw new TestRunError(
        `A run for build "${input.build}" already exists in this project.`,
        409,
        "DUPLICATE_BUILD",
      );
    }
    throw error;
  }
}

/**
 * Find-or-create by build — the idempotency primitive CI relies on. Re-running
 * a pipeline for the same build attaches to the existing run instead of
 * creating a second one.
 */
export async function findOrCreateRunForBuild(
  orgId: string,
  userId: string,
  input: CreateTestRunInput,
) {
  // Guarded here too: the find-by-build query below filters on projectId, so a
  // key would silently match nothing and create a duplicate run instead of
  // reusing the existing one — defeating CI idempotency.
  assertResolvedProjectId(input.projectId);

  if (input.build && input.source !== "manual") {
    const existing = await db.qtTestRun.findFirst({
      where: {
        orgId,
        projectId: input.projectId,
        build: input.build,
        source: { not: "manual" },
        isDeleted: false,
      },
      select: { id: true, refId: true, name: true },
    });
    if (existing) return { ...existing, testCount: 0, reused: true };
  }
  const created = await createTestRun(orgId, userId, input);
  return { ...created, reused: false };
}

/**
 * THE MANUAL WRITE PATH — appends one immutable result and refreshes the
 * cached current status.
 *
 * Everything happens in a single transaction so a failed attachment or defect
 * link cannot leave a result behind with a stale `currentStatusId`, and cannot
 * leave the cache pointing at a result that was rolled back.
 */
export async function recordManualResult(
  orgId: string,
  userId: string,
  testId: string,
  input: RecordResultInput,
) {
  const test = await db.qtTest.findFirst({
    where: { id: testId, orgId },
    select: {
      id: true,
      runId: true,
      caseId: true,
      run: { select: { state: true, build: true, projectId: true } },
    },
  });
  if (!test) {
    throw new TestRunError("Test not found.", 404, "TEST_NOT_FOUND");
  }

  // A closed run is frozen. This is the 409 the spec calls for, and it is
  // checked here rather than only in the UI so the API is authoritative.
  if (test.run.state === "closed") {
    throw new TestRunError(
      "This run is closed. Reopen it before recording more results.",
      409,
      "RUN_CLOSED",
    );
  }

  const status = await db.qtTestStatus.findFirst({
    where: { id: input.statusId, orgId, isDeleted: false },
    select: { id: true },
  });
  if (!status) {
    throw new TestRunError("Unknown status.", 400, "INVALID_STATUS");
  }

  // Step results must belong to THIS test's case, or a caller could attach
  // outcomes to another case's steps.
  if (input.stepResults && input.stepResults.length > 0) {
    const stepIds = input.stepResults.map((s) => s.stepId);
    const owned = await db.qtTestCaseStep.count({
      where: { id: { in: stepIds }, caseId: test.caseId, orgId },
    });
    if (owned !== new Set(stepIds).size) {
      throw new TestRunError(
        "One or more steps do not belong to this test's case.",
        400,
        "STEP_MISMATCH",
      );
    }
  }

  return db.$transaction(async (tx) => {
    const result = await tx.qtTestResult.create({
      data: {
        orgId,
        testId,
        runId: test.runId,
        statusId: input.statusId,
        source: "manual",
        executedBy: userId,
        elapsedMs: input.elapsedMs ?? null,
        comment: input.comment ?? null,
        build: test.run.build,
      },
      select: { id: true, statusId: true, createdAt: true },
    });

    if (input.stepResults && input.stepResults.length > 0) {
      await tx.qtTestStepResult.createMany({
        data: input.stepResults.map((s) => ({
          orgId,
          resultId: result.id,
          stepId: s.stepId,
          statusId: s.statusId,
          comment: s.comment ?? null,
        })),
      });
    }

    if (input.attachments && input.attachments.length > 0) {
      await tx.qtTestResultAttachment.createMany({
        data: input.attachments.map((a) => ({
          orgId,
          resultId: result.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          s3Key: a.s3Key,
          uploadedBy: userId,
        })),
      });
    }

    if (input.defectIssueIds && input.defectIssueIds.length > 0) {
      // Issue ids carry no FK by design, so validate membership explicitly —
      // otherwise a typo would silently create a dangling defect link.
      const issues = await tx.qtIssue.findMany({
        where: { id: { in: input.defectIssueIds }, orgId, isDeleted: false },
        select: { id: true },
      });
      if (issues.length !== new Set(input.defectIssueIds).size) {
        throw new TestRunError(
          "One or more linked issues could not be found.",
          400,
          "ISSUE_NOT_FOUND",
        );
      }
      await tx.qtTestDefectLink.createMany({
        data: issues.map((i) => ({
          orgId,
          resultId: result.id,
          issueId: i.id,
          createdBy: userId,
        })),
        skipDuplicates: true,
      });
    }

    // Refresh the cache LAST, in the same transaction. The trail is the truth;
    // this is only an index into it.
    await tx.qtTest.update({
      where: { id: testId },
      data: { currentStatusId: input.statusId },
    });

    return result;
  });
}

/** Closes a run, freezing further result writes. */
export async function setRunState(
  orgId: string,
  userId: string,
  runId: string,
  state: "open" | "closed",
) {
  const run = await db.qtTestRun.findFirst({
    where: { id: runId, orgId, isDeleted: false },
    select: { id: true, state: true },
  });
  if (!run) throw new TestRunError("Run not found.", 404, "RUN_NOT_FOUND");

  return db.qtTestRun.update({
    where: { id: runId },
    data:
      state === "closed"
        ? { state: "closed", closedAt: new Date(), closedBy: userId }
        : { state: "open", closedAt: null, closedBy: null },
    select: { id: true, state: true, closedAt: true },
  });
}

/**
 * Seeds a NEW run from the cases whose tests ended in a given state.
 * Copies cases, never results — the original run's trail stays untouched.
 */
export async function rerunTests(
  orgId: string,
  userId: string,
  runId: string,
  only: "failed" | "incomplete" | "retest",
  name?: string,
) {
  const run = await db.qtTestRun.findFirst({
    where: { id: runId, orgId, isDeleted: false },
    select: { id: true, projectId: true, name: true, suiteId: true, milestoneId: true },
  });
  if (!run) throw new TestRunError("Run not found.", 404, "RUN_NOT_FOUND");

  const statusKeys =
    only === "failed"
      ? ["failed", "automation_failed", "automation_error"]
      : only === "retest"
        ? ["retest"]
        : ["untested", "retest", "blocked"];

  const tests = await db.qtTest.findMany({
    where: {
      runId,
      orgId,
      currentStatus: { key: { in: statusKeys }, isDeleted: false },
    },
    select: { caseId: true },
  });

  if (tests.length === 0) {
    throw new TestRunError(
      `No ${only} tests in this run to re-run.`,
      400,
      "NOTHING_TO_RERUN",
    );
  }

  // Distinct: a config matrix produces several tests per case, and the new run
  // should materialise each case once (its own matrix is chosen afresh).
  const caseIds = Array.from(new Set(tests.map((t) => t.caseId)));

  return createTestRun(orgId, userId, {
    projectId: run.projectId,
    name: name ?? `${run.name} — re-run (${only})`,
    caseIds,
    milestoneId: run.milestoneId ?? undefined,
    source: "manual",
    includeDrafts: true, // these cases were already executed once
  });
}
