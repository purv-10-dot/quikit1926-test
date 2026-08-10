import { prisma } from "@/lib/db/prisma";
import type { CrmImportEntityType as ImportEntityType } from "@prisma/client";

const ENTITY_RANK: Record<ImportEntityType, number> = {
  leads: 0,
  activities: 1,
  workflows: 2,
  sla: 3,
};

/**
 * Returns true if the given job is blocked by another sibling job in the same
 * batch with a lower rank that's still queued/processing/failed/dead_letter.
 *
 * Mirrors the legacy NestJS batch-dependency logic so leads finish before
 * activities, activities before workflows, workflows before SLA.
 */
export async function isBlocked(jobId: string): Promise<boolean> {
  const job = await prisma.crmLeadImportJob.findUnique({ where: { id: jobId } });
  if (!job || !job.batchId) return false;
  const myRank = ENTITY_RANK[job.entityType];
  const blockers = await prisma.crmLeadImportJob.count({
    where: {
      tenantId: job.tenantId,
      batchId: job.batchId,
      entityType: { in: lowerEntities(myRank) },
      status: { in: ["queued", "processing"] },
    },
  });
  return blockers > 0;
}

function lowerEntities(rank: number): ImportEntityType[] {
  return (Object.entries(ENTITY_RANK) as Array<[ImportEntityType, number]>)
    .filter(([, r]) => r < rank)
    .map(([k]) => k);
}

/** Backoff in milliseconds: min(30, 2^attempts) minutes. */
export function backoffMs(attempts: number): number {
  return Math.min(30, Math.pow(2, attempts)) * 60_000;
}
