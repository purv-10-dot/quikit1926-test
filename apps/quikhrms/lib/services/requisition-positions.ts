import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/utils/audit";
import { computeStageTat, daysBetween } from "@/lib/recruit/sla";

// Same fallback used by the Recruiter Performance score when a level has no
// explicit Position -> Offer SLA configured.
const DEFAULT_POSITION_TO_OFFER_SLA_DAYS = 15;

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
  status: "Open" | "PendingOnboarding" | "Filled" | "Cancelled";
  assignedAt: Date | null;
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
           p."assignedAt", p."filledByApplicationId", p."filledAt",
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
  const free = await prisma.$queryRaw<{ id: string; positionCode: string }[]>`
    SELECT id, "positionCode" FROM "app_quikhrms"."RequisitionPosition"
    WHERE "orgId" = ${orgId} AND "requisitionId" = ${requisitionId}
      AND "recruiterId" IS NULL AND status = 'Open' AND "deletedAt" IS NULL
    ORDER BY "sequenceNo" ASC
    LIMIT ${count}`;
  if (free.length === 0) return 0;

  for (const p of free) {
    // "assignedAt" starts the Position → Offer TAT clock — stamped every time
    // a seat gets (re)assigned, even to a different recruiter (a fresh
    // handoff resets it; the prior recruiter's delay shouldn't count against
    // whoever picks it up next).
    await prisma.$executeRaw`
      UPDATE "app_quikhrms"."RequisitionPosition"
      SET "recruiterId" = ${recruiterId}, "assignedAt" = now(), "updatedBy" = ${userId}, "updatedAt" = now()
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

  void createAuditLog({
    orgId, userId, action: "Update", entityType: "Requisition", entityId: requisitionId,
    changes: { recruiterAssigned: recruiterId, positionCodes: free.map((p) => p.positionCode), count: free.length },
  });

  return free.length;
}

/**
 * Assigns (or reassigns) ONE SPECIFIC seat to a recruiter — picked by the
 * caller, not just "the oldest open one" like allocatePositions above.
 * Restamps "assignedAt" every time (a fresh handoff resets the Position →
 * Offer TAT clock). Returns false if the position doesn't exist, belongs to
 * a different requisition, or is no longer Open (already Filled/Cancelled).
 */
export async function assignPosition(
  orgId: string,
  requisitionId: string,
  positionId: string,
  recruiterId: string,
  userId: string,
): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string; positionCode: string }[]>`
    SELECT id, "positionCode" FROM "app_quikhrms"."RequisitionPosition"
    WHERE id = ${positionId} AND "orgId" = ${orgId} AND "requisitionId" = ${requisitionId}
      AND status = 'Open' AND "deletedAt" IS NULL
    LIMIT 1`;
  if (rows.length === 0) return false;

  await prisma.$executeRaw`
    UPDATE "app_quikhrms"."RequisitionPosition"
    SET "recruiterId" = ${recruiterId}, "assignedAt" = now(), "updatedBy" = ${userId}, "updatedAt" = now()
    WHERE id = ${positionId}`;

  const totalAllocated = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM "app_quikhrms"."RequisitionPosition"
    WHERE "orgId" = ${orgId} AND "requisitionId" = ${requisitionId} AND "recruiterId" = ${recruiterId} AND "deletedAt" IS NULL`;
  const positionsAssigned = Number(totalAllocated[0]?.n ?? 1);

  await prisma.requisitionRecruiter.upsert({
    where: { orgId_requisitionId_employeeId: { orgId, requisitionId, employeeId: recruiterId } },
    create: { orgId, requisitionId, employeeId: recruiterId, positionsAssigned, createdBy: userId, updatedBy: userId },
    update: { positionsAssigned, updatedBy: userId },
  });

  const requisition = await prisma.jobRequisition.findUnique({
    where: { id: requisitionId }, select: { title: true, requisitionNumber: true },
  });
  if (requisition) {
    await prisma.hrmsNotification.create({
      data: {
        orgId, employeeId: recruiterId, type: "Info", channel: "InApp",
        title: "Position assigned to you",
        message: `A position on "${requisition.title}" (${requisition.requisitionNumber}) has been allocated to you.`,
        entityType: "JobRequisition", entityId: requisitionId,
      },
    }).catch(() => { /* best-effort */ });
  }

  void createAuditLog({
    orgId, userId, action: "Update", entityType: "Requisition", entityId: requisitionId,
    changes: { recruiterAssigned: recruiterId, positionCode: rows[0].positionCode },
  });

  return true;
}

/**
 * Called when a JobApplication transitions to AppHired (offer accepted).
 * Reserves exactly one Open position allocated to that candidate's assigned
 * recruiter (oldest sequence first) and links it to the hiring application —
 * status goes to PendingOnboarding, NOT Filled yet, since the person hasn't
 * actually started. No-op (returns null) if the candidate has no assigned
 * recruiter, or that recruiter has no open seat left on this requisition —
 * hiring still proceeds either way, this is attribution/tracking only, never
 * a blocker.
 */
export async function reservePositionOnHire(
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
    SET status = 'PendingOnboarding', "filledByApplicationId" = ${applicationId},
        "updatedBy" = ${userId}, "updatedAt" = now()
    WHERE id = ${position.id}`;
  await prisma.$executeRaw`
    UPDATE "app_quikhrms"."JobApplication" SET "positionId" = ${position.id} WHERE id = ${applicationId}`;

  return position.id;
}

/**
 * Called when that same employee finishes onboarding (Confirm Employee) —
 * flips the seat reserved by reservePositionOnHire from PendingOnboarding to
 * Filled, stamping filledAt now (not at hire/offer-accept). No-op if the
 * application never reserved a seat (unassigned recruiter, or none left).
 */
export async function finalizePositionOnOnboard(orgId: string, applicationId: string, userId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "app_quikhrms"."RequisitionPosition"
    WHERE "orgId" = ${orgId} AND "filledByApplicationId" = ${applicationId}
      AND status = 'PendingOnboarding' AND "deletedAt" IS NULL
    LIMIT 1`;
  const position = rows[0];
  if (!position) return null;

  await prisma.$executeRaw`
    UPDATE "app_quikhrms"."RequisitionPosition"
    SET status = 'Filled', "filledAt" = now(), "updatedBy" = ${userId}, "updatedAt" = now()
    WHERE id = ${position.id}`;

  return position.id;
}

/** Reverses reservePositionOnHire/finalizePositionOnOnboard — called when a hire is later undone (rejected/declined/withdrawn post-hire). */
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

export type RevisePositionSlaResult =
  | { ok: true; slaRevisionCount: number; slaExtensionDays: number; baseTargetDays: number; customDeadline: boolean }
  | { ok: false; reason: string };

/**
 * HR explicitly revises a position's SLA once it's already MISSED. By
 * default the deadline pushes out by the level's base SLA days again (same
 * formula for everyone) — but HR can instead pass `customDeadline` to set
 * the new deadline to a SPECIFIC date (e.g. matching a candidate's notice
 * period, or a hiring manager's promised feedback date) rather than
 * whatever the level's SLA window happens to add up to. Either way the
 * revision count still increments — a custom date is still a revision, and
 * still costs Process Compliance points (see recruiter-performance route).
 * Refuses if the seat was never assigned, hasn't actually crossed its
 * (already-extended, if any) SLA yet, or the custom date doesn't actually
 * move the deadline forward.
 */
export async function revisePositionSla(
  orgId: string,
  requisitionId: string,
  positionId: string,
  userId: string,
  revisionReason?: string | null,
  customDeadline?: Date | null,
): Promise<RevisePositionSlaResult> {
  const rows = await prisma.$queryRaw<{ id: string; assignedAt: Date | null; filledAt: Date | null; status: string; slaRevisionCount: number; slaExtensionDays: number }[]>`
    SELECT id, "assignedAt", "filledAt", status, "slaRevisionCount", "slaExtensionDays"
    FROM "app_quikhrms"."RequisitionPosition"
    WHERE id = ${positionId} AND "orgId" = ${orgId} AND "requisitionId" = ${requisitionId} AND "deletedAt" IS NULL
    LIMIT 1`;
  const position = rows[0];
  if (!position) return { ok: false, reason: "Position not found." };
  if (!position.assignedAt) return { ok: false, reason: "This seat hasn't been assigned to a recruiter yet." };
  if (position.status === "Cancelled") return { ok: false, reason: "This position is cancelled." };

  const reqRow = await prisma.jobRequisition.findFirst({ where: { id: requisitionId, orgId, deletedAt: null }, select: { jobLevelId: true } });
  const level = reqRow?.jobLevelId
    ? await prisma.jobLevel.findFirst({ where: { id: reqRow.jobLevelId, orgId }, select: { positionToOfferSlaDays: true } })
    : null;
  const baseTargetDays = level?.positionToOfferSlaDays ?? DEFAULT_POSITION_TO_OFFER_SLA_DAYS;
  const effectiveTargetDays = baseTargetDays + position.slaExtensionDays;

  const tat = computeStageTat(position.assignedAt, position.filledAt, effectiveTargetDays, new Date());
  if (tat.status !== "MISSED") return { ok: false, reason: "This position hasn't crossed its SLA yet." };

  let slaExtensionDays: number;
  const usingCustomDeadline = !!customDeadline;
  if (customDeadline) {
    const daysFromAssigned = Math.round(daysBetween(position.assignedAt, customDeadline));
    if (daysFromAssigned <= effectiveTargetDays) {
      return { ok: false, reason: "The new deadline must be after the current deadline." };
    }
    slaExtensionDays = daysFromAssigned - baseTargetDays;
  } else {
    slaExtensionDays = position.slaExtensionDays + baseTargetDays;
  }
  const slaRevisionCount = position.slaRevisionCount + 1;

  const trimmedReason = revisionReason?.trim() || null;
  await prisma.$executeRaw`
    UPDATE "app_quikhrms"."RequisitionPosition"
    SET "slaRevisionCount" = ${slaRevisionCount}, "slaExtensionDays" = ${slaExtensionDays},
        "slaRevisionReason" = ${trimmedReason},
        "updatedBy" = ${userId}, "updatedAt" = now()
    WHERE id = ${position.id}`;

  void createAuditLog({
    orgId, userId, action: "Update", entityType: "RequisitionPosition", entityId: position.id,
    changes: { slaRevised: true, slaRevisionCount, addedDays: slaExtensionDays - position.slaExtensionDays, customDeadline: usingCustomDeadline, reason: trimmedReason },
  });

  return { ok: true, slaRevisionCount, slaExtensionDays, baseTargetDays, customDeadline: usingCustomDeadline };
}
