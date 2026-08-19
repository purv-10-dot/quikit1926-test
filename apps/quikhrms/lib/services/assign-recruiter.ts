import { prisma } from "@/lib/prisma";

/**
 * Round Robin — the auto-assignment fallback used whenever a candidate is
 * linked to a requisition WITHOUT HR explicitly picking a recruiter, and
 * without the caller's own "selfAssign" flag (see createApplicationSchema)
 * kicking in first. Rotates among recruiters who have an OPEN allocated
 * position on this requisition; returns null (Unassigned) if nobody has an
 * open seat there yet.
 *
 * Deliberately does NOT look at who originally created the candidate — that
 * would silently hand candidates to whoever added them even when they never
 * intended to personally own them (e.g. an HR_Head bulk-adding candidates
 * without picking a JR). Self-assignment only ever happens via the explicit
 * `selfAssign` flag on the SAME request that both creates a candidate AND
 * links it to a JR in one action.
 */
export async function resolveAssignedRecruiter(
  orgId: string,
  requisitionId: string,
): Promise<string | null> {
  const openPositions = await prisma.$queryRaw<{ recruiterId: string }[]>`
    SELECT DISTINCT "recruiterId" FROM "app_quikhrms"."RequisitionPosition"
    WHERE "orgId" = ${orgId} AND "requisitionId" = ${requisitionId}
      AND "recruiterId" IS NOT NULL AND status = 'Open' AND "deletedAt" IS NULL
    ORDER BY "recruiterId" ASC`;
  const eligible = openPositions.map((p) => p.recruiterId);
  if (eligible.length === 0) return null;

  const assignedCount = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM "app_quikhrms"."JobApplication"
    WHERE "orgId" = ${orgId} AND "requisitionId" = ${requisitionId}
      AND "assignedRecruiterId" IS NOT NULL AND "deletedAt" IS NULL`;
  const idx = Number(assignedCount[0]?.n ?? 0) % eligible.length;
  return eligible[idx];
}
