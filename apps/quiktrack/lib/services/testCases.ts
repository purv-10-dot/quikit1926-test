import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertResolvedProjectId } from "@/lib/test/projectId";
import type {
  CreateTestCaseInput,
  TestStepInput,
  UpdateTestCaseInput,
} from "@/lib/validation/testCase";

/**
 * QuikTest — test case service (P1).
 *
 * Holds the invariants that must not be duplicated across routes:
 *   • refId allocation (human-facing TC-1042) via the locking counter row
 *   • version snapshots on every edit — old snapshots are never mutated
 *   • duplicate automationId surfaced as a typed conflict, not a raw P2002
 *
 * Every function takes an explicit `orgId` and filters on it. Callers reach
 * these only through `withProjectAccess`, which has already established that
 * the user may act in the project.
 */

/** Thrown when a write violates a business rule the route maps to a status. */
export class TestCaseError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "TestCaseError";
    this.status = status;
    this.code = code;
  }
}

export const DUPLICATE_AUTOMATION_ID = "DUPLICATE_AUTOMATION_ID";

/**
 * Allocates the next human-facing id for a project.
 *
 * Uses the SQL function installed by the migration rather than MAX(refId)+1:
 * the counter row takes a lock, so concurrent CI writes serialise instead of
 * colliding on the unique index. Must run inside the caller's transaction so a
 * failed insert does not burn an id... and note it deliberately DOES burn one on
 * rollback, which is correct — gaps are fine, duplicates are not.
 */
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
  if (typeof n !== "number") {
    throw new Error("refId allocation returned no value");
  }
  return n;
}

/** The snapshot shape stored in QtTestCaseVersion.snapshot. */
interface CaseSnapshot {
  title: string;
  description: string | null;
  preconditions: string | null;
  priority: string;
  type: string;
  steps: Array<{ orderNo: number; action: string; expected: string | null }>;
}

function buildSnapshot(input: {
  title: string;
  description: string | null;
  preconditions: string | null;
  priority: string;
  type: string;
  steps: TestStepInput[];
}): CaseSnapshot {
  return {
    title: input.title,
    description: input.description,
    preconditions: input.preconditions,
    priority: input.priority,
    type: input.type,
    steps: input.steps.map((s, i) => ({
      orderNo: i + 1,
      action: s.action,
      expected: s.expected ?? null,
    })),
  };
}

/** Maps Prisma's unique-violation on the automationId index to a 409. */
function rethrowAsConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new TestCaseError(
      "Another case in this project already uses that automation ID.",
      409,
      DUPLICATE_AUTOMATION_ID,
    );
  }
  throw error;
}

/**
 * Creates a case with version 1.
 *
 * One transaction: allocate refId → insert case → insert steps → write the v1
 * snapshot. If any part fails the whole thing rolls back, so a case can never
 * exist without its version-1 snapshot (which every historical run relies on).
 */
export async function createTestCase(
  orgId: string,
  projectId: string,
  userId: string,
  input: CreateTestCaseInput,
) {
  // MUST be a resolved cuid, not a projectKey. The case row stores projectId and
  // the automationId uniqueness index is scoped by it, so a stored key would
  // both hide the case from id-based queries and let duplicate automation ids
  // through. Routes resolve via gateProjectResolved before calling in.
  assertResolvedProjectId(projectId);

  // Verify the section belongs to this project before writing anything —
  // otherwise a caller could plant a case in another project's tree.
  const section = await db.qtTestSection.findFirst({
    where: { id: input.sectionId, orgId, isDeleted: false },
    select: { id: true, suite: { select: { projectId: true } } },
  });
  if (!section || section.suite.projectId !== projectId) {
    throw new TestCaseError("Section not found in this project.", 404, "SECTION_NOT_FOUND");
  }

  try {
    return await db.$transaction(async (tx) => {
      const refId = await nextRefId(tx, orgId, projectId, "case");

      const created = await tx.qtTestCase.create({
        data: {
          orgId,
          projectId,
          sectionId: input.sectionId,
          refId,
          title: input.title,
          description: input.description ?? null,
          preconditions: input.preconditions ?? null,
          priority: input.priority,
          type: input.type,
          automationStatus: input.automationStatus,
          automationId: input.automationId ?? null,
          ownerId: input.ownerId ?? null,
          estimateMs: input.estimateMs ?? null,
          templateId: input.templateId ?? null,
          currentVersion: 1,
          createdBy: userId,
        },
        select: { id: true, refId: true },
      });

      if (input.steps.length > 0) {
        await tx.qtTestCaseStep.createMany({
          data: input.steps.map((s, i) => ({
            orgId,
            caseId: created.id,
            orderNo: i + 1,
            action: s.action,
            expected: s.expected ?? null,
          })),
        });
      }

      await tx.qtTestCaseVersion.create({
        data: {
          orgId,
          caseId: created.id,
          versionNo: 1,
          snapshot: buildSnapshot({
            title: input.title,
            description: input.description ?? null,
            preconditions: input.preconditions ?? null,
            priority: input.priority,
            type: input.type,
            steps: input.steps,
          }) as unknown as Prisma.InputJsonValue,
          editedBy: userId,
        },
      });

      if (input.tagIds && input.tagIds.length > 0) {
        await tx.qtTestCaseTag.createMany({
          data: input.tagIds.map((tagId) => ({ orgId, caseId: created.id, tagId })),
          skipDuplicates: true,
        });
      }

      return created;
    });
  } catch (error: unknown) {
    rethrowAsConflict(error);
  }
}

/**
 * Updates a case and snapshots the new state as the next version.
 *
 * Editing NEVER mutates an existing snapshot: `currentVersion` advances and a
 * fresh row is written, so a run that pinned version 3 keeps showing version 3's
 * steps forever. That is the whole reason versions exist.
 */
export async function updateTestCase(
  orgId: string,
  projectId: string,
  userId: string,
  caseId: string,
  input: UpdateTestCaseInput,
) {
  const existing = await db.qtTestCase.findFirst({
    where: { id: caseId, orgId, projectId, isDeleted: false },
    select: {
      id: true,
      title: true,
      description: true,
      preconditions: true,
      priority: true,
      type: true,
      currentVersion: true,
      steps: {
        orderBy: { orderNo: "asc" },
        select: { action: true, expected: true },
      },
    },
  });
  if (!existing) {
    throw new TestCaseError("Test case not found.", 404, "CASE_NOT_FOUND");
  }

  // Moving between sections must stay inside the project.
  if (input.sectionId) {
    const section = await db.qtTestSection.findFirst({
      where: { id: input.sectionId, orgId, isDeleted: false },
      select: { suite: { select: { projectId: true } } },
    });
    if (!section || section.suite.projectId !== projectId) {
      throw new TestCaseError("Section not found in this project.", 404, "SECTION_NOT_FOUND");
    }
  }

  const nextSteps: TestStepInput[] =
    input.steps ??
    existing.steps.map((s) => ({
      action: s.action,
      expected: s.expected ?? undefined,
    }));

  const merged = {
    title: input.title ?? existing.title,
    description:
      input.description === undefined ? existing.description : input.description,
    preconditions:
      input.preconditions === undefined
        ? existing.preconditions
        : input.preconditions,
    priority: input.priority ?? existing.priority,
    type: input.type ?? existing.type,
  };

  const nextVersion = existing.currentVersion + 1;

  try {
    return await db.$transaction(async (tx) => {
      const updated = await tx.qtTestCase.update({
        where: { id: caseId },
        data: {
          ...(input.sectionId ? { sectionId: input.sectionId } : {}),
          title: merged.title,
          description: merged.description,
          preconditions: merged.preconditions,
          priority: merged.priority,
          type: merged.type,
          ...(input.automationStatus ? { automationStatus: input.automationStatus } : {}),
          ...(input.automationId !== undefined ? { automationId: input.automationId } : {}),
          ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
          ...(input.estimateMs !== undefined ? { estimateMs: input.estimateMs } : {}),
          ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
          currentVersion: nextVersion,
          updatedBy: userId,
        },
        select: { id: true, refId: true, currentVersion: true },
      });

      // Steps are replaced wholesale when supplied. Safe because the outgoing
      // definition is already preserved in the previous version's snapshot.
      if (input.steps) {
        await tx.qtTestCaseStep.deleteMany({ where: { caseId } });
        if (input.steps.length > 0) {
          await tx.qtTestCaseStep.createMany({
            data: input.steps.map((s, i) => ({
              orgId,
              caseId,
              orderNo: i + 1,
              action: s.action,
              expected: s.expected ?? null,
            })),
          });
        }
      }

      await tx.qtTestCaseVersion.create({
        data: {
          orgId,
          caseId,
          versionNo: nextVersion,
          snapshot: buildSnapshot({
            ...merged,
            steps: nextSteps,
          }) as unknown as Prisma.InputJsonValue,
          editedBy: userId,
        },
      });

      if (input.tagIds) {
        await tx.qtTestCaseTag.deleteMany({ where: { caseId } });
        if (input.tagIds.length > 0) {
          await tx.qtTestCaseTag.createMany({
            data: input.tagIds.map((tagId) => ({ orgId, caseId, tagId })),
            skipDuplicates: true,
          });
        }
      }

      return updated;
    });
  } catch (error: unknown) {
    rethrowAsConflict(error);
  }
}

/**
 * Restores an old version by writing its content forward as a NEW version.
 *
 * Never rewinds `currentVersion` — history stays append-only and the rollback
 * itself is visible in the version list.
 */
export async function rollbackTestCase(
  orgId: string,
  projectId: string,
  userId: string,
  caseId: string,
  versionNo: number,
) {
  const version = await db.qtTestCaseVersion.findFirst({
    where: { caseId, versionNo, orgId },
    select: { snapshot: true },
  });
  if (!version) {
    throw new TestCaseError("Version not found.", 404, "VERSION_NOT_FOUND");
  }

  const snap = version.snapshot as unknown as CaseSnapshot;
  return updateTestCase(orgId, projectId, userId, caseId, {
    title: snap.title,
    description: snap.description,
    preconditions: snap.preconditions,
    priority: snap.priority as UpdateTestCaseInput["priority"],
    type: snap.type as UpdateTestCaseInput["type"],
    steps: (snap.steps ?? []).map((s) => ({
      action: s.action,
      expected: s.expected ?? undefined,
    })),
  });
}

/**
 * Soft-deletes a case. Hard delete is deliberately not offered: a case may be
 * referenced by tests in historical runs, and removing it would orphan a result
 * trail that is supposed to be permanent.
 */
export async function archiveTestCase(
  orgId: string,
  projectId: string,
  userId: string,
  caseId: string,
) {
  const existing = await db.qtTestCase.findFirst({
    where: { id: caseId, orgId, projectId, isDeleted: false },
    select: { id: true },
  });
  if (!existing) {
    throw new TestCaseError("Test case not found.", 404, "CASE_NOT_FOUND");
  }
  return db.qtTestCase.update({
    where: { id: caseId },
    data: { isDeleted: true, updatedBy: userId },
    select: { id: true },
  });
}
