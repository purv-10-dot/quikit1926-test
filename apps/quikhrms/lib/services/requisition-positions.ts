import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Recruiter & Position Tracking (Phase 1). `RequisitionPosition` isn't in the
 * generated Prisma client yet, so every query here goes through raw SQL (see
 * packages/database/prisma/schema.prisma → RequisitionPosition).
 */

export interface RequisitionPositionRow {
  id: string;
  requisitionId: string;
  positionCode: string;
  sequenceNo: number;
  recruiterId: string | null;
  status: "Open" | "Filled" | "Cancelled";
  filledByApplicationId: string | null;
  filledAt: Date | null;
}

/**
 * Creates one RequisitionPosition row per opening, right when the requisition
 * itself is created — e.g. 5 positions → 5 rows, coded
 * "{requisitionNumber}-01" .. "-05". Never duplicates the requisition itself
 * (one JD, one budget, one approval chain) — these are lightweight per-seat
 * rows underneath it.
 */
export async function generatePositionsForRequisition(
  orgId: string,
  requisitionId: string,
  requisitionNumber: string,
  count: number,
  userId: string,
): Promise<void> {
  const rows = Array.from({ length: Math.max(0, count) }, (_, i) => {
    const seq = i + 1;
    return {
      id: crypto.randomUUID(),
      seq,
      code: `${requisitionNumber}-${String(seq).padStart(2, "0")}`,
    };
  });
  for (const r of rows) {
    await prisma.$executeRaw`
      INSERT INTO "app_quikhrms"."RequisitionPosition"
        (id, "orgId", "requisitionId", "positionCode", "sequenceNo", status, "createdBy", "updatedBy", "createdAt", "updatedAt")
      VALUES (${r.id}, ${orgId}, ${requisitionId}, ${r.code}, ${r.seq}, 'Open', ${userId}, ${userId}, now(), now())
      ON CONFLICT ("orgId", "requisitionId", "sequenceNo") DO NOTHING`;
  }
}

/** List every position for a requisition, recruiter name included. */
export async function listPositions(orgId: string, requisitionId: string) {
  return prisma.$queryRaw<(RequisitionPositionRow & { recruiterFirstName: string | null; recruiterLastName: string | null })[]>`
    SELECT p.id, p."requisitionId", p."positionCode", p."sequenceNo", p."recruiterId", p.status,
           p."filledByApplicationId", p."filledAt",
           e."firstName" AS "recruiterFirstName", e."lastName" AS "recruiterLastName"
    FROM "app_quikhrms"."RequisitionPosition" p
    LEFT JOIN "app_quikhrms"."Employee" e ON e.id = p."recruiterId"
    WHERE p."orgId" = ${orgId} AND p."requisitionId" = ${requisitionId} AND p."deletedAt" IS NULL
    ORDER BY p."sequenceNo" ASC`;
}

/**
 * Allocates `count` still-unassigned Open positions on this requisition to a
 * recruiter, and keeps the existing `RequisitionRecruiter` quota table (used
 * by the SLA cron, Recruiter Performance dashboard, and Approvals workload
 * count) in sync — those keep working unchanged. Returns how many were
 * actually allocated (may be fewer than requested if not enough are free).
 */
export async function allocatePositions(
  orgId: string,
  requisitionId: string,
  recruiterId: string,
  count: number,
  userId: string,
): Promise<number> {
  const free = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "app_quikhrms"."RequisitionPosition"
    WHERE "orgId" = ${orgId} AND "requisitionId" = ${requisitionId}
      AND "recruiterId" IS NULL AND status = 'Open' AND "deletedAt" IS NULL
    ORDER BY "sequenceNo" ASC
    LIMIT ${count}`;
  if (free.length === 0) return 0;

  for (const p of free) {
    await prisma.$executeRaw`
      UPDATE "app_quikhrms"."RequisitionPosition"
      SET "recruiterId" = ${recruiterId}, "updatedBy" = ${userId}, "updatedAt" = now()
      WHERE id = ${p.id}`;
  }

  const totalAllocated = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM "app_quikhrms"."RequisitionPosition"
    WHERE "orgId" = ${orgId} AND "requisitionId" = ${requisitionId} AND "recruiterId" = ${recruiterId} AND "deletedAt" IS NULL`;
  const positionsAssigned = Number(totalAllocated[0]?.n ?? free.length);

  await prisma.requisitionRecruiter.upsert({
    where: { orgId_requisitionId_employeeId: { orgId, requisitionId, employeeId: recruiterId } },
    create: { orgId, requisitionId, employeeId: recruiterId, positionsAssigned, createdBy: userId, updatedBy: userId },
    update: { positionsAssigned, updatedBy: userId },
  });

  // Let the recruiter know — otherwise an allocation is invisible to them
  // until they happen to check Recruiter Performance or reopen this modal.
  const requisition = await prisma.jobRequisition.findUnique({
    where: { id: requisitionId }, select: { title: true, requisitionNumber: true },
  });
  if (requisition) {
    await prisma.hrmsNotification.create({
      data: {
        orgId, employeeId: recruiterId, type: "Info", channel: "InApp",
        title: "Positions assigned to you",
        message: `${free.length} position${free.length === 1 ? "" : "s"} on "${requisition.title}" (${requisition.requisitionNumber}) ${free.length === 1 ? "has" : "have"} been allocated to you.`,
        entityType: "JobRequisition", entityId: requisitionId,
      },
    }).catch(() => { /* best-effort */ });
  }

  return free.length;
}

/**
 * Called when a JobApplication transitions to AppHired. Consumes exactly one
 * Open position allocated to that candidate's assigned recruiter (oldest
 * sequence first) and links it to the hiring application. No-op (returns
 * null) if the candidate has no assigned recruiter, or that recruiter has no
 * open seat left on this requisition — hiring still proceeds either way, this
 * is attribution/tracking only, never a blocker.
 */
export async function consumePositionOnHire(
  orgId: string,
  requisitionId: string,
  recruiterId: string | null,
  applicationId: string,
  userId: string,
): Promise<string | null> {
  if (!recruiterId) return null;
  const candidates = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "app_quikhrms"."RequisitionPosition"
    WHERE "orgId" = ${orgId} AND "requisitionId" = ${requisitionId}
      AND "recruiterId" = ${recruiterId} AND status = 'Open' AND "deletedAt" IS NULL
    ORDER BY "sequenceNo" ASC
    LIMIT 1`;
  const position = candidates[0];
  if (!position) return null;

  await prisma.$executeRaw`
    UPDATE "app_quikhrms"."RequisitionPosition"
    SET status = 'Filled', "filledByApplicationId" = ${applicationId}, "filledAt" = now(),
        "updatedBy" = ${userId}, "updatedAt" = now()
    WHERE id = ${position.id}`;
  await prisma.$executeRaw`
    UPDATE "app_quikhrms"."JobApplication" SET "positionId" = ${position.id} WHERE id = ${applicationId}`;

  return position.id;
}

/** Reverses consumePositionOnHire — called when a hire is later undone (rejected/declined/withdrawn post-hire). */
export async function releasePositionOnUnhire(orgId: string, applicationId: string, userId: string): Promise<void> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "app_quikhrms"."RequisitionPosition"
    WHERE "orgId" = ${orgId} AND "filledByApplicationId" = ${applicationId} AND "deletedAt" IS NULL
    LIMIT 1`;
  const position = rows[0];
  if (!position) return;

  await prisma.$executeRaw`
    UPDATE "app_quikhrms"."RequisitionPosition"
    SET status = 'Open', "filledByApplicationId" = NULL, "filledAt" = NULL,
        "updatedBy" = ${userId}, "updatedAt" = now()
    WHERE id = ${position.id}`;
  await prisma.$executeRaw`
    UPDATE "app_quikhrms"."JobApplication" SET "positionId" = NULL WHERE id = ${applicationId}`;
}
