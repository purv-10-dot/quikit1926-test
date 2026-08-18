import type { QceLead } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import {
  getPipelineConfig,
  validateLeadPipelineCascade,
} from "@/lib/services/workspace/pipeline-config";
import { logActivity } from "@/lib/services/activities/log-activity";
import { recordLeadChange } from "@/lib/services/leads/change-log";
import { onLeadUpdated } from "@/lib/services/automation/triggers";
import { publishLeadEvent } from "@/lib/services/leads/realtime";
import { enqueueLeadSquaredSyncSafe } from "@/lib/queue/leadsquared-queue";
import { scheduleLeadScoreRecalc } from "@/lib/services/leads/lead-scoring/schedule";
import type { TransitionLeadInput } from "@/lib/validators/lead";

export class LeadTransitionError extends Error {
  constructor(
    message: string,
    public status: number = 400,
  ) {
    super(message);
    this.name = "LeadTransitionError";
  }
}

export async function transitionLead(opts: {
  user: SessionUser;
  leadId: string;
  input: TransitionLeadInput;
}): Promise<QceLead> {
  const { user, leadId, input } = opts;
  const existing = await prisma.qceLead.findUnique({ where: { id: leadId } });
  if (!existing || existing.orgId !== user.orgId) {
    throw new LeadTransitionError("Not found", 404);
  }
  if (existing.deletedAt) {
    throw new LeadTransitionError("Lead is in trash. Restore it before changing stage.", 410);
  }

  const pipeline = await getPipelineConfig(user.orgId);
  // Full cascade (source → stage → status → sub-status), shared with create/PATCH.
  // Source is unchanged by a transition, so validate the incoming stage/status/
  // substatus against the EFFECTIVE record. This also adds the status → sub-status
  // edge the transition path never previously checked.
  const cascadeError = validateLeadPipelineCascade({
    pipeline,
    source: existing.source,
    stage: input.stage !== undefined ? input.stage : existing.stage,
    status: input.status !== undefined ? input.status : existing.status,
    substatus: input.substatus !== undefined ? input.substatus : existing.substatus,
    writing: {
      source: false,
      stage: input.stage !== undefined,
      status: input.status !== undefined,
      substatus: input.substatus !== undefined,
    },
  });
  if (cascadeError) {
    const detail = cascadeError.errors[cascadeError.field] ?? "";
    throw new LeadTransitionError(`${cascadeError.message} ${detail}`.trim());
  }

  const data: Record<string, unknown> = {};
  if (input.stage !== undefined) data.stage = input.stage;
  if (input.status !== undefined) data.status = input.status;
  if (input.substatus !== undefined) data.substatus = input.substatus;

  if (Object.keys(data).length === 0) {
    throw new LeadTransitionError("No transition fields provided.");
  }

  const stageChanged =
    input.stage !== undefined && input.stage !== existing.stage;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.qceLead.update({
      where: { id: leadId },
      data,
    });

    if (stageChanged) {
      await logActivity({
        orgId: user.orgId,
        userId: user.userId,
        type: "LeadStageChange",
        relatedKind: "Lead",
        relatedObjectId: leadId,
        leadId,
        subject: `Stage: ${existing.stage} → ${input.stage}`,
        outcome: "Stage updated",
        activityCode: "stage_change",
        detailNotes: `Pipeline stage changed from "${existing.stage}" to "${input.stage}".`,
        occurredAt: new Date(),
        tx,
      });
    }

    return row;
  });

  await recordLeadChange({
    orgId: user.orgId,
    userId: user.userId,
    leadId,
    action: "UPDATE",
    before: existing,
    after: updated,
    metadata: stageChanged ? { source: "pipeline_stepper" } : undefined,
  });

  onLeadUpdated(user.orgId, leadId).catch((e) => console.error(e));
  scheduleLeadScoreRecalc(user.orgId, leadId);
  if (stageChanged) {
    publishLeadEvent(user.orgId, {
      type: "transitioned",
      leadId: updated.id,
      stage: updated.stage,
      fromStage: existing.stage,
    }).catch(() => {});
  }
  // Enqueue outbound LeadSquared push (CRM-origin). Non-blocking + swallowed.
  void enqueueLeadSquaredSyncSafe({
    orgId: user.orgId,
    crmLeadId: leadId,
  }).catch((e) => console.error("[leadsquared] enqueue (transition) failed", e));

  return updated;
}
