import { prisma } from "@/lib/prisma";

/**
 * Job Requisition ids this recruiter is assigned to — via the multi-recruiter
 * split (RequisitionRecruiter, any position count > 0 counts, not just the
 * primary/first row) or the legacy single recruiterId scalar. Used to scope
 * Job Openings / Candidates / Hiring Pipeline down to "my jobs" for the
 * Recruiter role (hrms.recruit.read_self) — HR_Head-style roles
 * (hrms.recruit.read) skip this and see everything.
 */
export async function getMyJobRequisitionIds(orgId: string, employeeId: string): Promise<string[]> {
  const rows = await prisma.jobRequisition.findMany({
    where: {
      orgId, deletedAt: null,
      OR: [
        { recruiterId: employeeId },
        { recruiterSplits: { some: { employeeId, deletedAt: null } } },
      ],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
