import { prisma } from "@/lib/db/prisma";

/**
 * Round-robin user picker for the `distribute_lead` workflow node.
 * Atomic increment via Prisma `update({ where: unique, data: { lastIndex: { increment: 1 } } })`.
 *
 * Port of automation-engine.service.ts::distributeLead behavior.
 */
export async function pickNextUser(opts: {
  orgId: string;
  workflowId: string;
  nodeId: string;
  candidateUserIds: string[];
}): Promise<string | null> {
  if (opts.candidateUserIds.length === 0) return null;

  // Upsert the state row, then atomically increment & read in one call
  const state = await prisma.crmAutomationDistributionState.upsert({
    where: {
      orgId_workflowId_nodeId: {
        orgId: opts.orgId,
        workflowId: opts.workflowId,
        nodeId: opts.nodeId,
      },
    },
    create: {
      orgId: opts.orgId,
      workflowId: opts.workflowId,
      nodeId: opts.nodeId,
      lastIndex: 0,
    },
    update: { lastIndex: { increment: 1 } },
  });
  const idx = state.lastIndex % opts.candidateUserIds.length;
  return opts.candidateUserIds[idx] ?? null;
}
