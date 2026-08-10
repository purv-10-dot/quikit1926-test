// apps/quikcredflow/lib/services/telephony/disposition-engine.ts
/**
 * Server-side workflow that runs when an agent saves a call disposition.
 * Ports PlatformDataService.createCallLog from the legacy NestJS CRM.
 *
 *   1. Load the chosen QcfCallDisposition (tenant-scoped).
 *   2. Backfill from the most recent unmatched QcfIndiaVoiceWebhookLog within
 *      4h that we can plausibly attribute to this call (by callSid/campid or
 *      phone-tail).
 *   3. Resolve the linked lead from `linkedLeadId` or by phone-tail lookup.
 *   4. UPSERT the QcfCallLog row (reuse the dialer pre-stub if we have a sid).
 *   5. Consume the orphan webhook by setting matchedCallLogId on it.
 *   6. Write the lead-timeline `Call · <name>` activity.
 *   7. Compute mapped stage/status from the disposition name and apply it,
 *      then write a second `LeadStageChange · Disposition update · <…>`
 *      activity describing every field that changed.
 *   8. When `followUpAt` is set, write a third `FollowUp` activity.
 *
 * Returns the new CallLog id and a flag that tells the UI whether to redirect
 * the user to the payment-verification view.
 */

import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { triggerOutboundSync } from "@/lib/services/leadsquared/outbound-trigger";
import { findExistingFollowUpTask } from "@/lib/services/tasks";
import { runAfterActivityLogged } from "@/lib/services/automation/disposition-rule-engine";
import { onLeadUpdated } from "@/lib/services/automation/triggers";
import {
  saveAndApplyDisposition,
  type DispositionFieldValue,
} from "@/lib/services/forms/disposition-save.service";
import type { RuleDecision } from "@/lib/services/forms/form-rule-evaluator";

export interface CreateCallLogDto {
  /**
   * FR-RE Stage 3-D(a): the EXPLICIT origin of this save (not inferred from
   * providerCallSid). "dialer" = a real telephony call happened -> write a
   * QcfCallLog row. "manual" = an agent disposition update with no call ->
   * activities only, NO call-log row. Set by the parent that knows the context.
   */
  source: "dialer" | "manual";
  toNumber: string;
  fromNumber?: string | null;
  durationSec?: number | null;
  /** Option Y: optional — when blank/absent, createCallLog resolves the internal
   *  "Call" disposition. A supplied id still resolves its row (no regression). */
  callDispositionId?: string | null;
  linkedLeadId?: string | null;
  providerCallSid?: string | null;
  status?: string | null;
  subStage?: string | null;
  reason?: string | null;
  nextStage?: string | null;
  notes?: string | null;
  followUpAt?: string | Date | null;
  demoScheduledBy?: string | null;
  demoScheduledOn?: string | Date | null;
  endedBy?: "agent" | "customer" | "system" | "unknown" | null;
  /**
   * FR-D2: the actual time the call occurred, entered by the agent.
   * Must be in the past or present — a future value is rejected with a 422
   * rather than silently clamped, so the agent knows their input was wrong.
   * Omitting this field defaults to server `now` at save time.
   */
  activityDateTime?: string | Date | null;
  /**
   * FR-RE: the custom disposition field values the agent entered, keyed by
   * fieldKey. Persisted as QcfFieldValue and fed to the rule engine. Type is
   * resolved server-side from the live form version (client type not trusted).
   */
  dispositionFieldValues?: Record<string, DispositionFieldValue> | null;
}

export interface CreateCallLogResult {
  /** Stage 3-D(a): null on a manual save (no real call -> no QcfCallLog row). */
  id: string | null;
  dispositionName: string;
  paymentVerificationRequired: boolean;
  linkedLeadId: string | null;
  /**
   * FR-RE: the resolved rule decision (status move + field visibility/requirement
   * + tabs) so the agent UI can show what changed. Undefined when the tenant has
   * no live form set (legacy path).
   */
  formDecision?: RuleDecision;
}

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

function lastTen(num: string | null | undefined): string {
  const digits = (num || "").replace(/\D+/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

function dispositionKeyFor(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
}

/**
 * FR-RE Stage 3-A (Option Y): the disposition is an internal logging ACTION, not
 * an agent selection. When the agent saves from Status without picking one, we
 * resolve a fixed, invisible "Call" disposition (find-or-create per tenant). It
 * carries no targetLeadStage and does not trigger payment verification — Status
 * (+ FR-RE rules) owns stage/status/reveal now. Reused across saves via the
 * @@unique([orgId, code]) on "call".
 */
const INTERNAL_CALL_CODE = "call";
const INTERNAL_CALL_NAME = "Call";

async function resolveInternalCallDisposition(orgId: string) {
  const existing = await prisma.qcfCallDisposition.findFirst({
    where: { orgId, code: INTERNAL_CALL_CODE },
  });
  if (existing) return existing;
  // upsert-on-unique guards the race where two concurrent saves both seed it.
  return prisma.qcfCallDisposition.upsert({
    where: { orgId_code: { orgId, code: INTERNAL_CALL_CODE } },
    update: {},
    create: {
      orgId,
      code: INTERNAL_CALL_CODE,
      label: INTERNAL_CALL_NAME,
      name: INTERNAL_CALL_NAME,
      triggersPaymentVerification: false,
    },
  });
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    const err = new Error("Invalid date in call disposition payload") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  return d;
}

export async function createCallLog(
  orgId: string,
  ownerId: string,
  ownerName: string,
  dto: CreateCallLogDto,
): Promise<CreateCallLogResult> {
  // FR-RE decision (Option A) — assigned below if a live form set applies; read
  // in the return. Declared at function scope so it survives the inner block.
  let formDecision: RuleDecision | undefined;
  // Option Y: a supplied callDispositionId still resolves its row (no regression
  // for callers that pass one); when it is blank/unmatched, fall back to the
  // internal "Call" logging disposition rather than 404. The agent saves from
  // Status — the disposition is plumbing, never a required agent pick.
  const requestedId = (dto.callDispositionId ?? "").trim();
  const disposition = requestedId
    ? (await prisma.qcfCallDisposition.findFirst({ where: { id: requestedId, orgId } })) ??
      (await resolveInternalCallDisposition(orgId))
    : await resolveInternalCallDisposition(orgId);
  const dispositionName = disposition.name ?? disposition.label;

  const since = new Date(Date.now() - FOUR_HOURS_MS);
  const sid = (dto.providerCallSid || "").trim() || null;
  const tailFrom = lastTen(dto.fromNumber);
  const tailTo = lastTen(dto.toNumber);

  const orphanOr: Prisma.QcfIndiaVoiceWebhookLogWhereInput[] = [];
  if (sid) orphanOr.push({ callSid: sid }, { campid: sid });
  if (tailTo) orphanOr.push({ sourceNumber: { endsWith: tailTo } });
  if (tailFrom) orphanOr.push({ dialWhomNumber: { endsWith: tailFrom } });

  const orphan =
    orphanOr.length > 0
      ? await prisma.qcfIndiaVoiceWebhookLog.findFirst({
          where: {
            orgId,
            matchedCallLogId: null,
            createdAt: { gte: since },
            OR: orphanOr,
          },
          orderBy: { createdAt: "desc" },
        })
      : null;

  let leadId: string | null = null;
  let leadDisplayName = "";
  if (dto.linkedLeadId && dto.linkedLeadId.trim()) {
    const explicit = await prisma.qcfLead.findFirst({
      where: { id: dto.linkedLeadId.trim(), orgId },
      select: { id: true, name: true },
    });
    if (explicit) {
      leadId = explicit.id;
      leadDisplayName = explicit.name;
    }
  }
  if (!leadId && tailTo) {
    const matched = await prisma.qcfLead.findFirst({
      where: {
        orgId,
        OR: [{ phone: { endsWith: tailTo } }, { mobile: { endsWith: tailTo } }],
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    });
    if (matched) {
      leadId = matched.id;
      leadDisplayName = matched.name;
    }
  }

  const followUpAt = toDate(dto.followUpAt ?? null);
  const demoScheduledOn = toDate(dto.demoScheduledOn ?? null);
  const requestedDuration =
    dto.durationSec != null && Number.isFinite(dto.durationSec) && dto.durationSec >= 0
      ? Math.floor(dto.durationSec)
      : null;
  const backfillDuration =
    orphan?.callDurationSec && orphan.callDurationSec > 0 ? orphan.callDurationSec : null;

  const baseCallLogFields = {
    leadId: leadId ?? undefined,
    ownerName,
    agentUserId: ownerId,
    sourceNumber: dto.fromNumber?.trim() || orphan?.dialWhomNumber || undefined,
    destinationNumber: dto.toNumber.trim(),
    direction: orphan?.direction || "outbound",
    durationSec: backfillDuration ?? requestedDuration ?? undefined,
    talkSec: orphan?.talkDurationSec ?? undefined,
    recordingUrl: orphan?.callRecordingUrl ?? undefined,
    webhookStatus: orphan?.status ?? undefined,
    status: "completed",
    disposition: dispositionName,
    dispositionName,
    callDispositionId: disposition.id,
    smbDispositionSnapshot: disposition.smbDispositionValue ?? null,
    smbSubDispositionSnapshot: disposition.smbSubDispositionValue ?? null,
    smbSubSubDispositionSnapshot: disposition.smbSubSubDispositionValue ?? null,
    linkedPartyDisplay: leadId ? `Lead: ${leadDisplayName || "—"}` : "Unknown contact",
    notes: dto.notes ?? null,
    followUpAt,
    endedBy: dto.endedBy ?? undefined,
  } as const;

  // FR-RE Stage 3-D(a): a QcfCallLog row means a real call happened. Only the
  // dialer flow (source="dialer") writes one; a manual disposition update
  // (source="manual") records activities only — no fabricated call row. Reuse
  // the dialer-flow stub when we have a sid and it has not yet been
  // dispositioned, to avoid a duplicate row across placeCall() + the modal.
  const isRealCall = dto.source === "dialer";
  const existingStub =
    isRealCall && sid
      ? await prisma.qcfCallLog.findFirst({
          where: {
            orgId,
            dispositionName: null,
            OR: [{ providerCallSid: sid }, { callSid: sid }],
          },
          orderBy: { createdAt: "desc" },
        })
      : null;

  const callLog = !isRealCall
    ? null
    : existingStub
      ? await prisma.qcfCallLog.update({
          where: { id: existingStub.id },
          data: {
            ...baseCallLogFields,
            recordingUrl: existingStub.recordingUrl || baseCallLogFields.recordingUrl || null,
            durationSec: existingStub.durationSec ?? baseCallLogFields.durationSec ?? null,
            webhookStatus: existingStub.webhookStatus || baseCallLogFields.webhookStatus || null,
            providerCallSid: existingStub.providerCallSid || sid || null,
          },
        })
      : await prisma.qcfCallLog.create({
          data: {
            orgId,
            callSid: sid,
            providerCallSid: sid || orphan?.callSid || null,
            ...baseCallLogFields,
          },
        });

  if (orphan && callLog) {
    await prisma.qcfIndiaVoiceWebhookLog.update({
      where: { id: orphan.id },
      data: { matchedCallLogId: callLog.id },
    });
  }

  if (leadId) {
    const now = new Date();

    // FR-D2: use the agent-supplied activity time, or fall back to server now.
    // A future timestamp is invalid for a call that already happened — reject
    // it explicitly so the agent gets a clear error instead of silent overwrite.
    const activityOccurredAt = (() => {
      const d = toDate(dto.activityDateTime ?? null);
      if (!d) return now;
      if (d.getTime() > now.getTime()) {
        const err = new Error(
          `activityDateTime cannot be set in the future for a call activity ` +
          `(supplied: ${d.toISOString()}, server: ${now.toISOString()}). ` +
          `Provide the actual call time or leave it blank to use the current time.`,
        ) as Error & { statusCode?: number };
        err.statusCode = 422;
        throw err;
      }
      return d;
    })();

    const selectedStatus = (dto.status ?? "").trim();
    const selectedSubStage = (dto.subStage ?? "").trim();
    const selectedReason = (dto.reason ?? "").trim();
    const demoScheduledBy = (dto.demoScheduledBy ?? "").trim();
    const notes = (dto.notes ?? "").trim();
    // (selectedNextStage + dispositionKey removed — the hardcoded stage mapping
    //  that used them is retired; automation owns the stage now.)

    const detailLines = [
      `Duration: ${requestedDuration ?? 0}s`,
      selectedStatus ? `Status: ${selectedStatus}` : "",
      notes ? `Notes: ${notes}` : "",
      selectedSubStage ? `Sub Stage: ${selectedSubStage}` : "",
      selectedReason ? `Reason: ${selectedReason}` : "",
    ].filter(Boolean);

    const callActivity = await prisma.qcfActivity.create({
      data: {
        orgId,
        type: "Call",
        relatedKind: "Lead",
        relatedObjectId: leadId,
        leadId,
        // Option Y (Stage 3-A): the activity reads from Status, not the internal
        // disposition. detailNotes carries Status/Notes/etc., so outcome is left
        // empty — the timeline renders the clean single line "Call Disposition -
        // <Status>" (see lib/utils/activity-headline.ts). Falls back to the
        // disposition name only when no status was supplied.
        subject: `Call Disposition - ${selectedStatus || dispositionName}`,
        outcome: "",
        ownerName,
        occurredAt: activityOccurredAt,
        detailNotes: detailLines.join("\n") || null,
        linkedCallLogId: callLog?.id ?? null,
      },
    });

    // FR-D3 / FR-D2: evaluate automation rules after the call activity write.
    // activityDatetime is the agent-supplied time (FR-D2) so create_task rules
    // correctly schedule the callback task at the reported call time (AC-5).
    await runAfterActivityLogged({
      orgId,
      leadId,
      activityId: callActivity.id,
      dispositionCode: disposition.code,
      activityDatetime: activityOccurredAt,
      ownerId,
    });

    // [pipeline-ownership] The disposition no longer DERIVES or writes a Contact
    // Stage. The workflow-automation engine (R1–R21) is the single owner of the
    // stage transition now: the disposition persists the agent's RAW selections
    // (status + sub-stage) to the lead, emits onLeadUpdated, and automation
    // decides the resulting stage. The old hardcoded dispositionKey→stage/status
    // mapping ("Active", "Payment Pending", "Awaiting Payment", …) is retired —
    // it used vocabulary that no longer matches the configured pipeline and
    // fought the automation engine for stage ownership. Status is the agent's
    // own pick; sub-stage likewise. Payment-verification is unaffected (it keys
    // off disposition.triggersPaymentVerification, not the mapped stage/status).
    const mappedStatus = selectedStatus;

    const lead = await prisma.qcfLead.findFirst({
      where: { id: leadId, orgId },
      select: { id: true, stage: true, status: true, substatus: true, dynamicFields: true },
    });
    if (lead) {
      const changed: string[] = [];
      const data: Prisma.QcfLeadUpdateInput = {};
      // NOTE: no stage write here anymore — automation owns the Contact Stage
      // (see the pipeline-ownership note above). The disposition writes only the
      // agent's raw status + sub-stage selections; automation reacts via the
      // onLeadUpdated emit at the end of this block.
      if (mappedStatus && mappedStatus !== (lead.status ?? "")) {
        changed.push(`Status: ${lead.status || "—"} -> ${mappedStatus}`);
        data.status = mappedStatus;
      }
      // [disposition→substatus] Write the agent-selected Sub-Stage to the lead's
      // real `substatus` COLUMN, the same field Quick Edit writes and the same
      // field the workflow-automation engine reads. Previously Sub-Stage went
      // ONLY into dynamicFields.callDispositionSubStage (below), leaving the
      // substatus column null after a disposition — so the lead record was
      // incomplete AND substatus-triggered automations (R18/R19/R21, R1/R3/R9)
      // could never fire from a disposition. This is additive: the dynamicFields
      // write is preserved for anything already reading it. Column write is the
      // source of truth; dynamicFields becomes a mirror. Change-conditional so a
      // re-save with the same value is a no-op.
      const currentSubstatus =
        (lead as unknown as { substatus?: string | null }).substatus ?? "";
      if (selectedSubStage && selectedSubStage !== currentSubstatus) {
        changed.push(`Substatus: ${currentSubstatus || "—"} -> ${selectedSubStage}`);
        data.substatus = selectedSubStage;
      }
      const dyn = (lead.dynamicFields as Record<string, unknown> | null) ?? {};
      const newDyn: Record<string, unknown> = { ...dyn };
      // [last-activity] A call disposition IS an activity, so advance the lead's
      // `last_activity_date` to the call time. CredFlow filters on this field
      // (e.g. "Last Activity Date is before today"); without this stamp the field
      // kept its old imported value after a call, so the lead never dropped off a
      // before-today filter (the field the filter reads never changed). Stamped
      // UNCONDITIONALLY on every disposition (unlike the sub-stage/reason writes
      // below, which are selection-dependent) — every call must count as activity.
      // ISO/UTC to match all other dynamic dates + the filter engine's comparison.
      newDyn.last_activity_date = activityOccurredAt.toISOString();
      newDyn.last_activity = "Call Disposition";
      changed.push(`Last Activity Date: ${activityOccurredAt.toISOString()}`);
      if (selectedSubStage) {
        newDyn.callDispositionSubStage = selectedSubStage;
        changed.push(`Sub Stage: ${selectedSubStage}`);
      }
      if (selectedReason) {
        newDyn.callDispositionReason = selectedReason;
        changed.push(`Reason: ${selectedReason}`);
      }
      if (demoScheduledBy) {
        newDyn.demoScheduledBy = demoScheduledBy;
        changed.push(`Demo Scheduled By: ${demoScheduledBy}`);
      }
      if (demoScheduledOn) {
        newDyn.demoScheduledOn = demoScheduledOn.toISOString();
        changed.push(`Demo Scheduled On: ${demoScheduledOn.toISOString()}`);
      }
      if (followUpAt) {
        newDyn.nextFollowUpAt = followUpAt.toISOString();
        changed.push(`Next Follow Up: ${followUpAt.toISOString()}`);
      }
      // Always persist newDyn: the last_activity_date/last_activity stamp above
      // is written on EVERY disposition (even a status-only save with no
      // sub-stage/reason/demo/follow-up), so dynamicFields always changed here.
      // The old guard gated the write on those optional selections and would
      // have silently dropped the last-activity stamp on a status-only save.
      data.dynamicFields = newDyn as Prisma.InputJsonValue;
      if (changed.length > 0) {
        await prisma.qcfLead.update({ where: { id: leadId }, data });
        // Outbound sync (status/substatus/stage changed). Fire-and-forget.
        triggerOutboundSync({ orgId, crmLeadId: leadId });
        await prisma.qcfActivity.create({
          data: {
            orgId,
            type: "LeadStageChange",
            relatedKind: "Lead",
            relatedObjectId: leadId,
            leadId,
            subject: `Disposition update · ${mappedStatus || dispositionName}`,
            outcome: "",
            ownerName,
            occurredAt: now,
            detailNotes: changed.join("\n"),
          },
        });
      }
    }

    // FR-RE (Option A): runs LAST, after FR-D3 and the built-in disposition
    // mapping above. It persists the agent's custom field values and evaluates
    // the live form's rules; applyFormRules writes lead.status ONLY when a rule
    // fires (decision.setStage), so it OVERRIDES the mapping when a rule matches
    // and is a no-op (mapping stands) when none do. Tenants with no live form set
    // get null (legacy untouched). See docs/fr-re-followups.md.
    if (leadId) {
      const frre = await saveAndApplyDisposition({
        orgId,
        leadId,
        activityId: callActivity.id,
        fieldValues: dto.dispositionFieldValues ?? {},
      });
      formDecision = frre?.decision;

      // FR-RE visibility: applyFormRules moves lead.stage (Contact Stage) when a
      // rule fires but records ONLY a QcfAuditLog — so the change never showed on
      // the lead timeline, making a firing rule look dead. Log the move as its own
      // LeadStageChange activity so the rule's effect is visible + traceable,
      // mirroring the built-in mapping's own entry above.
      if (frre?.stageApplied && frre.decision.setStage) {
        const ruleStage = frre.decision.setStage.status; // carries a stage name
        await prisma.qcfActivity.create({
          data: {
            orgId,
            type: "LeadStageChange",
            relatedKind: "Lead",
            relatedObjectId: leadId,
            leadId,
            subject: `Rule update · ${ruleStage}`,
            outcome: "",
            ownerName,
            occurredAt: now,
            detailNotes: `Contact Stage: ${frre.previousStage || "—"} → ${ruleStage} (automation rule)`,
          },
        });
      }
    }

    // [disposition→automation] Emit the workflow-automation trigger AFTER the
    // lead's disposition-driven state is fully settled (built-in mapping above
    // AND the FR-RE form-rule engine, which runs last and can also move stage/
    // status). This is the SAME emit the leads PATCH route fires — it is what
    // routes a disposition-driven lead change into the R1–R21 workflow engine,
    // so rules fire from the call-disposition section, not only from Quick Edit.
    // Placed here (end of the leadId block) so the engine reads the FINAL state,
    // never an intermediate one. Fire-and-forget: a trigger-enqueue failure must
    // not fail the disposition save. The engine is change-conditional + loop-
    // guarded (S2), so if an automation targets the value the disposition already
    // set, it is a safe no-op rather than a double-move.
    onLeadUpdated(orgId, leadId).catch((err) =>
      console.error("[automation] onLeadUpdated (from disposition) failed", err),
    );

    if (followUpAt) {
      await prisma.qcfActivity.create({
        data: {
          orgId,
          type: "FollowUp",
          relatedKind: "Lead",
          relatedObjectId: leadId,
          leadId,
          subject: `Follow up scheduled · ${dispositionName}`,
          outcome: "Follow Up Required",
          ownerName,
          occurredAt: now,
          followUpAt,
          detailNotes: notes || `Follow up set from call disposition: ${dispositionName}`,
          linkedCallLogId: callLog?.id ?? null,
        },
      });

      // Auto-create the follow-up reminder task the agent expects when they
      // fill Follow Up Date in the disposition modal. Best-effort idempotent:
      // re-saving the same disposition within ±2min collapses to the existing
      // task. TODO(integration): replace with sourceCallLogId unique key
      // once the schema overhaul lands.
      const dup = await findExistingFollowUpTask({
        orgId,
        leadId,
        dueDate: followUpAt,
        // No call-log row on a manual save — dedup the double-save window around
        // `now` instead of the (absent) call-log createdAt.
        callLogCreatedAt: callLog?.createdAt ?? now,
      });
      if (!dup) {
        const lead = await prisma.qcfLead.findFirst({
          where: { id: leadId, orgId },
          select: { ownerId: true, name: true },
        });
        await prisma.qcfTask.create({
          data: {
            orgId,
            subject: `Follow up · ${lead?.name ?? leadDisplayName ?? ""}`.trim(),
            taskType: "FollowUp",
            priority: "Medium",
            status: "Open",
            dueDate: followUpAt,
            assignedToUserId: lead?.ownerId ?? ownerId,
            relatedKind: "Lead",
            relatedObjectId: leadId,
            leadId,
          },
        });
      }
    }
  }

  return {
    id: callLog?.id ?? null,
    dispositionName,
    paymentVerificationRequired: !!disposition.triggersPaymentVerification,
    linkedLeadId: leadId,
    formDecision,
  };
}
