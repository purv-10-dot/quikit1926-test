/**
 * Batch workflow-repair classification for list endpoints.
 *
 * A detail route classifies one instance from data it already loads. A list
 * needs the same signal per row so the stuck documents are visible without
 * opening each one — but doing that per row would be N queries. This resolves
 * a whole page in three: instances, live steps (only for rows with no
 * submit-time snapshot), and history.
 *
 * Only pending instances are considered; a settled one has nothing to repair.
 */

import { db } from "@/lib/db";
import {
  classifyRepair,
  parseStepsSnapshot,
  type RepairAssessment,
} from "@/lib/approvals/step-resolution";

export async function loadRepairFlags(
  approvalIds: Array<string | null | undefined>,
): Promise<Map<string, RepairAssessment>> {
  const ids = [...new Set(approvalIds.filter((v): v is string => Boolean(v)))];
  if (ids.length === 0) return new Map();

  const instances = await db.cnApprovalInstance.findMany({
    where: { id: { in: ids }, status: "pending_approval" },
    select: {
      id: true,
      workflowId: true,
      currentStepOrder: true,
      stepsSnapshot: true,
    },
  });
  if (!Array.isArray(instances) || instances.length === 0) return new Map();

  const snapshotById = new Map(
    instances.map((i) => [i.id, parseStepsSnapshot(i.stepsSnapshot)] as const),
  );

  // Live steps are only needed for pre-snapshot rows.
  const workflowIdsNeedingLive = [
    ...new Set(
      instances.filter((i) => !snapshotById.get(i.id)).map((i) => i.workflowId),
    ),
  ];
  const liveSteps =
    workflowIdsNeedingLive.length > 0
      ? await db.cnApprovalWorkflowStep.findMany({
          where: { workflowId: { in: workflowIdsNeedingLive } },
          select: { workflowId: true, stepOrder: true },
          orderBy: { stepOrder: "asc" },
        })
      : [];
  const liveByWorkflow = new Map<string, Array<{ stepOrder: number }>>();
  for (const s of Array.isArray(liveSteps) ? liveSteps : []) {
    const list = liveByWorkflow.get(s.workflowId) ?? [];
    list.push({ stepOrder: s.stepOrder });
    liveByWorkflow.set(s.workflowId, list);
  }

  const history = await db.cnApprovalHistory.findMany({
    where: { instanceId: { in: instances.map((i) => i.id) } },
    select: { instanceId: true, stepOrder: true, action: true },
  });
  const historyByInstance = new Map<
    string,
    Array<{ stepOrder: number; action: string }>
  >();
  for (const h of Array.isArray(history) ? history : []) {
    const list = historyByInstance.get(h.instanceId) ?? [];
    list.push({ stepOrder: h.stepOrder, action: h.action });
    historyByInstance.set(h.instanceId, list);
  }

  const out = new Map<string, RepairAssessment>();
  for (const i of instances) {
    const steps =
      snapshotById.get(i.id) ?? liveByWorkflow.get(i.workflowId) ?? [];
    out.set(
      i.id,
      classifyRepair(
        steps,
        historyByInstance.get(i.id) ?? [],
        i.currentStepOrder,
      ),
    );
  }
  return out;
}
