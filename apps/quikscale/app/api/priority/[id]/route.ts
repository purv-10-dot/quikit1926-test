import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
const auth = withOrgAuthForResource("priority", "Priority");
import { updatePrioritySchema } from "@/lib/schemas/prioritySchema";
import { writeAuditLog } from "@/lib/api/auditLog";
import { notifyPriorityReplacement } from "@/lib/services/priorityNotifications";
import { PRIORITY_DEFAULT_STATUS } from "@/lib/constants/status";
import {
  audit,
  requestContext,
  classifyUpdateAction,
  diffFields,
  PRIORITY_AUDIT_FIELDS,
} from "@/lib/audit";

/** Before/after fields needed to diff a Priority for the audit timeline. */
const PRIORITY_AUDIT_SELECT = {
  orgId: true,
  teamId: true,
  createdBy: true,
  name: true,
  description: true,
  owner: true,
  quarter: true,
  year: true,
  startWeek: true,
  endWeek: true,
  overallStatus: true,
  notes: true,
} as const;


const PRIORITY_SELECT = {
  id: true,
  name: true,
  description: true,
  owner: true,
  teamId: true,
  quarter: true,
  year: true,
  startWeek: true,
  endWeek: true,
  overallStatus: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  orgId: true,
  owner_user: { select: { id: true, firstName: true, lastName: true } },
  team: { select: { id: true, name: true } },
  weeklyStatuses: {
    select: { id: true, priorityId: true, weekNumber: true, status: true, notes: true },
    orderBy: { weekNumber: "asc" as const },
  },
};

export const GET = auth.view<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const priority = await db.priority.findFirst({
    where: { id: params.id },
    select: PRIORITY_SELECT,
  });
  if (!priority) return NextResponse.json({ success: false, error: "Priority not found" }, { status: 404 });
  if (priority.orgId !== orgId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  return NextResponse.json({ success: true, data: priority });
});

export const PUT = auth.update<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const existing = await db.priority.findUnique({
    where: { id: params.id },
    select: PRIORITY_AUDIT_SELECT,
  });
  if (!existing) return NextResponse.json({ success: false, error: "Priority not found" }, { status: 404 });
  if (existing.orgId !== orgId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  // Legacy instance-level edit gate (canEditPriority: creator / assignee /
  // legacy admin) removed per product spec — RBAC v2 `Priority:update`
  // (enforced by `auth.update`) is the sole guard now.

  const parsed = updatePrioritySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, description, owner, teamId, quarter, year, startWeek, endWeek, overallStatus, notes, resetWeeklyData } = parsed.data;

  const updated = await db.priority.update({
    where: { id: params.id },
    data: {
      name: name ?? undefined,
      description: description ?? null,
      owner: owner ?? undefined,
      teamId: teamId ?? null,
      quarter: quarter ?? undefined,
      year: year ?? undefined,
      startWeek: startWeek ?? null,
      endWeek: endWeek ?? null,
      // On reset, force the status back to the default; otherwise honour the
      // payload (omitted → unchanged, so carry-forward keeps the status).
      overallStatus: resetWeeklyData ? PRIORITY_DEFAULT_STATUS : (overallStatus ?? undefined),
      // PATCH semantics: omitted notes are left UNCHANGED (carry-forward keeps
      // them); an explicit value replaces; reset clears below.
      notes: resetWeeklyData ? null : (notes === undefined ? undefined : notes),
      updatedBy: userId,
    },
    select: PRIORITY_SELECT,
  });

  // ── OPSP "Replace → Reset" ──
  // Start the replaced priority fresh: drop every weekly status row (and their
  // per-week notes). overallStatus + top-level notes were already reset above.
  // The Change-History timeline is immutable and stays intact.
  if (resetWeeklyData) {
    await db.priorityWeeklyStatus.deleteMany({ where: { priorityId: params.id } });
  }

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "UPDATE",
    entityType: "Priority",
    entityId: params.id,
    newValues: updated,
  });

  // ── Centralized audit (dual-write) ── field-level diff; the headline action
  // is the most specific category among the changed fields (status → STATUS,
  // owner → OWNERSHIP, team → ASSIGNMENT). Skipped when nothing meaningful
  // changed so no-op saves don't litter the timeline.
  const auditChanges = diffFields(existing, updated, { include: PRIORITY_AUDIT_FIELDS });
  await audit.log({
    entityType: "PRIORITY",
    entityId: params.id,
    action: classifyUpdateAction(auditChanges.map((c) => c.fieldName)),
    actor: { userId, orgId, teamId: updated.teamId },
    changes: auditChanges,
    skipIfNoChanges: true,
    ...requestContext(req),
  });

  // ── Replacement email ──
  // Set only by the OPSP "Export → Replace Priority" flow, so ordinary edits
  // stay quiet. Tells the owner their priority was replaced (and whether their
  // weekly data was retained or reset). Fire-and-forget.
  if (parsed.data.notifyReplacement && updated.owner) {
    notifyPriorityReplacement({
      orgId,
      priorityId: updated.id,
      oldName: existing.name,
      newName: updated.name,
      quarter: updated.quarter,
      year: updated.year,
      replacedByUserId: userId,
      ownerUserId: updated.owner,
      dataRetained: !resetWeeklyData,
    }).catch((err) => {
      console.error("[PUT /api/priority/[id]] notifyPriorityReplacement failed:", err);
    });
  }

  return NextResponse.json({ success: true, data: updated });
});

export const DELETE = auth.delete<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const existing = await db.priority.findUnique({
    where: { id: params.id },
    select: PRIORITY_AUDIT_SELECT,
  });
  if (!existing) return NextResponse.json({ success: false, error: "Priority not found" }, { status: 404 });
  if (existing.orgId !== orgId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  // Legacy instance-level delete gate removed per product spec. RBAC v2
  // `Priority:delete` (enforced by `auth.delete`) is the sole guard now.

  // Soft delete
  await db.priority.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), updatedBy: userId },
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "DELETE",
    entityType: "Priority",
    entityId: params.id,
    oldValues: existing,
  });

  // ── Centralized audit (dual-write) ── DELETE with a snapshot of the
  // soft-deleted Priority for the timeline + forensics.
  await audit.log({
    entityType: "PRIORITY",
    entityId: params.id,
    action: "DELETE",
    actor: { userId, orgId, teamId: existing.teamId },
    snapshot: existing,
    ...requestContext(req),
  });

  return NextResponse.json({ success: true, message: "Priority deleted successfully" });
});
