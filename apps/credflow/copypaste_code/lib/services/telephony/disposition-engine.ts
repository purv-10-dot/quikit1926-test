// apps/quikcrm/lib/services/telephony/disposition-engine.ts
/**
 * Server-side workflow that runs when an agent saves a call disposition.
 * Ports PlatformDataService.createCallLog from the legacy NestJS CRM.
 *
 *   1. Load the chosen CrmCallDisposition (tenant-scoped).
 *   2. Backfill from the most recent unmatched CrmIndiaVoiceWebhookLog within
 *      4h that we can plausibly attribute to this call (by callSid/campid or
 *      phone-tail).
 *   3. Resolve the linked lead from `linkedLeadId` or by phone-tail lookup.
 *   4. UPSERT the CrmCallLog row (reuse the dialer pre-stub if we have a sid).
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
import { findExistingFollowUpTask } from "@/lib/services/tasks";

export interface CreateCallLogDto {
  toNumber: string;
  fromNumber?: string | null;
  durationSec?: number | null;
  callDispositionId: string;
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
}

export interface CreateCallLogResult {
  id: string;
  dispositionName: string;
  paymentVerificationRequired: boolean;
  linkedLeadId: string | null;
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
  tenantId: string,
  ownerId: string,
  ownerName: string,
  dto: CreateCallLogDto,
): Promise<CreateCallLogResult> {
  const disposition = await prisma.crmCallDisposition.findFirst({
    where: { id: dto.callDispositionId, tenantId },
  });
  if (!disposition) {
    const err = new Error("Call disposition not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  const dispositionName = disposition.name ?? disposition.label;

  const since = new Date(Date.now() - FOUR_HOURS_MS);
  const sid = (dto.providerCallSid || "").trim() || null;
  const tailFrom = lastTen(dto.fromNumber);
  const tailTo = lastTen(dto.toNumber);

  const orphanOr: Prisma.CrmIndiaVoiceWebhookLogWhereInput[] = [];
  if (sid) orphanOr.push({ callSid: sid }, { campid: sid });
  if (tailTo) orphanOr.push({ sourceNumber: { endsWith: tailTo } });
  if (tailFrom) orphanOr.push({ dialWhomNumber: { endsWith: tailFrom } });

  const orphan =
    orphanOr.length > 0
      ? await prisma.crmIndiaVoiceWebhookLog.findFirst({
          where: {
            tenantId,
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
    const explicit = await prisma.crmLead.findFirst({
      where: { id: dto.linkedLeadId.trim(), tenantId },
      select: { id: true, name: true },
    });
    if (explicit) {
      leadId = explicit.id;
      leadDisplayName = explicit.name;
    }
  }
  if (!leadId && tailTo) {
    const matched = await prisma.crmLead.findFirst({
      where: {
        tenantId,
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

  // Reuse the dialer-flow stub when we have a sid and it has not yet been
  // dispositioned. This avoids a duplicate row when both placeCall() and the
  // disposition modal write for the same provider call.
  const existingStub = sid
    ? await prisma.crmCallLog.findFirst({
        where: {
          tenantId,
          dispositionName: null,
          OR: [{ providerCallSid: sid }, { callSid: sid }],
        },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const callLog = existingStub
    ? await prisma.crmCallLog.update({
        where: { id: existingStub.id },
        data: {
          ...baseCallLogFields,
          recordingUrl: existingStub.recordingUrl || baseCallLogFields.recordingUrl || null,
          durationSec: existingStub.durationSec ?? baseCallLogFields.durationSec ?? null,
          webhookStatus: existingStub.webhookStatus || baseCallLogFields.webhookStatus || null,
          providerCallSid: existingStub.providerCallSid || sid || null,
        },
      })
    : await prisma.crmCallLog.create({
        data: {
          tenantId,
          callSid: sid,
          providerCallSid: sid || orphan?.callSid || null,
          ...baseCallLogFields,
        },
      });

  if (orphan) {
    await prisma.crmIndiaVoiceWebhookLog.update({
      where: { id: orphan.id },
      data: { matchedCallLogId: callLog.id },
    });
  }

  if (leadId) {
    const now = new Date();
    const selectedStatus = (dto.status ?? "").trim();
    const selectedSubStage = (dto.subStage ?? "").trim();
    const selectedReason = (dto.reason ?? "").trim();
    const selectedNextStage = (dto.nextStage ?? "").trim();
    const demoScheduledBy = (dto.demoScheduledBy ?? "").trim();
    const notes = (dto.notes ?? "").trim();
    const dispositionKey = dispositionKeyFor(dispositionName);

    const detailLines = [
      `Duration: ${requestedDuration ?? 0}s`,
      selectedStatus ? `Status: ${selectedStatus}` : "",
      notes ? `Notes: ${notes}` : "",
      selectedSubStage ? `Sub Stage: ${selectedSubStage}` : "",
      selectedReason ? `Reason: ${selectedReason}` : "",
    ].filter(Boolean);

    await prisma.crmActivity.create({
      data: {
        tenantId,
        type: "Call",
        relatedKind: "Lead",
        relatedObjectId: leadId,
        leadId,
        subject: `Call · ${dispositionName}`,
        outcome: dispositionName,
        ownerName,
        occurredAt: now,
        detailNotes: detailLines.join("\n") || null,
        linkedCallLogId: callLog.id,
      },
    });

    let mappedStage = selectedNextStage || (disposition.targetLeadStage?.trim() ?? "");
    let mappedStatus = selectedStatus;
    if (
      dispositionKey === "demo scheduled" ||
      dispositionKey === "meeting booked" ||
      dispositionKey === "connected - meeting booked"
    ) {
      mappedStage = "Demo Scheduled";
      mappedStatus = "Demo Booked";
    } else if (dispositionKey === "not connected") {
      mappedStage = "Not Connected (New Lead)";
      mappedStatus = "Attempted";
    } else if (dispositionKey === "discussion pending") {
      mappedStage = "Active";
      mappedStatus = "Discussion Pending [Answered Calls]";
    } else if (
      dispositionKey === "payment verification" ||
      dispositionKey === "payment done" ||
      dispositionKey === "paymentdone"
    ) {
      mappedStage = "Payment Pending";
      mappedStatus = "Awaiting Payment";
    }

    const lead = await prisma.crmLead.findFirst({
      where: { id: leadId, tenantId },
      select: { id: true, stage: true, status: true, dynamicFields: true },
    });
    if (lead) {
      const changed: string[] = [];
      const data: Prisma.CrmLeadUpdateInput = {};
      if (mappedStage && mappedStage !== lead.stage) {
        changed.push(`Stage: ${lead.stage} -> ${mappedStage}`);
        data.stage = mappedStage;
      }
      if (mappedStatus && mappedStatus !== (lead.status ?? "")) {
        changed.push(`Status: ${lead.status || "—"} -> ${mappedStatus}`);
        data.status = mappedStatus;
      }
      const dyn = (lead.dynamicFields as Record<string, unknown> | null) ?? {};
      const newDyn: Record<string, unknown> = { ...dyn };
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
      if (Object.keys(newDyn).length > Object.keys(dyn).length || newDyn !== dyn) {
        const dynChanged =
          selectedSubStage || selectedReason || demoScheduledBy || demoScheduledOn || followUpAt;
        if (dynChanged) data.dynamicFields = newDyn as Prisma.InputJsonValue;
      }
      if (changed.length > 0) {
        await prisma.crmLead.update({ where: { id: leadId }, data });
        await prisma.crmActivity.create({
          data: {
            tenantId,
            type: "LeadStageChange",
            relatedKind: "Lead",
            relatedObjectId: leadId,
            leadId,
            subject: `Disposition update · ${mappedStatus || mappedStage || dispositionName}`,
            outcome: "",
            ownerName,
            occurredAt: now,
            detailNotes: changed.join("\n"),
          },
        });
      }
    }

    if (followUpAt) {
      await prisma.crmActivity.create({
        data: {
          tenantId,
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
          linkedCallLogId: callLog.id,
        },
      });

      // Auto-create the follow-up reminder task the agent expects when they
      // fill Follow Up Date in the disposition modal. Best-effort idempotent:
      // re-saving the same disposition within ±2min collapses to the existing
      // task. TODO(integration): replace with sourceCallLogId unique key
      // once the schema overhaul lands.
      const dup = await findExistingFollowUpTask({
        tenantId,
        leadId,
        dueDate: followUpAt,
        callLogCreatedAt: callLog.createdAt,
      });
      if (!dup) {
        const lead = await prisma.crmLead.findFirst({
          where: { id: leadId, tenantId },
          select: { ownerId: true, name: true },
        });
        await prisma.crmTask.create({
          data: {
            tenantId,
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
    id: callLog.id,
    dispositionName,
    paymentVerificationRequired: !!disposition.triggersPaymentVerification,
    linkedLeadId: leadId,
  };
}
