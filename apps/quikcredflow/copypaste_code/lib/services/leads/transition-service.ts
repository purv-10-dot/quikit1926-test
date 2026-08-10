import type { CrmLead } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import { getPipelineConfig } from "@/lib/services/workspace/pipeline-config";
import { logActivity } from "@/lib/services/activities/log-activity";
import { recordLeadChange } from "@/lib/services/leads/change-log";
import { onLeadUpdated } from "@/lib/services/automation/triggers";
import { publishLeadEvent } from "@/lib/services/leads/realtime";
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
}): Promise<CrmLead> {
  const { user, leadId, input } = opts;
  const existing = await prisma.crmLead.findUnique({ where: { id: leadId } });
  if (!existing || existing.tenantId !== user.tenantId) {
    throw new LeadTransitionError("Not found", 404);
  }
  if (existing.deletedAt) {
    throw new LeadTransitionError("Lead is in trash. Restore it before changing stage.", 410);
  }

  const pipeline = await getPipelineConfig(user.tenantId);
  if (input.stage && !pipeline.stages.includes(input.stage)) {
    throw new LeadTransitionError(`Stage "${input.stage}" is not configured for this workspace.`);
  }
  if (input.status && !pipeline.statuses.includes(input.status)) {
    throw new LeadTransitionError(`Status "${input.status}" is not configured for this workspace.`);
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
    const row = await tx.crmLead.update({
      where: { id: leadId },
      data,
    });

    if (stageChanged) {
      await logActivity({
        tenantId: user.tenantId,
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
    tenantId: user.tenantId,
    userId: user.userId,
    leadId,
    action: "UPDATE",
    before: existing,
    after: updated,
    metadata: stageChanged ? { source: "pipeline_stepper" } : undefined,
  });

  onLeadUpdated(user.tenantId, leadId).catch((e) => console.error(e));
  scheduleLeadScoreRecalc(user.tenantId, leadId);
  if (stageChanged) {
    publishLeadEvent(user.tenantId, {
      type: "transitioned",
      leadId: updated.id,
      stage: updated.stage,
      fromStage: existing.stage,
    }).catch(() => {});
  }

  return updated;
}
