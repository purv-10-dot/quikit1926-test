import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
const auth = withOrgAuthForResource("priority", "Priority");
import { updatePrioritySchema } from "@/lib/schemas/prioritySchema";
import { writeAuditLog } from "@/lib/api/auditLog";


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
    select: { orgId: true, createdBy: true, owner: true },
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
  const { name, description, owner, teamId, quarter, year, startWeek, endWeek, overallStatus, notes } = parsed.data;

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
      overallStatus: overallStatus ?? undefined,
      notes: notes ?? null,
      updatedBy: userId,
    },
    select: PRIORITY_SELECT,
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "UPDATE",
    entityType: "Priority",
    entityId: params.id,
    newValues: updated,
  });

  return NextResponse.json({ success: true, data: updated });
});

export const DELETE = auth.delete<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const existing = await db.priority.findUnique({
    where: { id: params.id },
    select: { orgId: true, createdBy: true, owner: true },
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

  return NextResponse.json({ success: true, message: "Priority deleted successfully" });
});
