import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("priority");
import { updatePrioritySchema } from "@/lib/schemas/prioritySchema";
import { writeAuditLog } from "@/lib/api/auditLog";
import { canEditPriority } from "@/lib/api/priorityPermissions";


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

export const GET = withTenantAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const priority = await db.priority.findFirst({
    where: { id: params.id },
    select: PRIORITY_SELECT,
  });
  if (!priority) return NextResponse.json({ success: false, error: "Priority not found" }, { status: 404 });
  if (priority.orgId !== orgId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  return NextResponse.json({ success: true, data: priority });
});

export const PUT = withTenantAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const existing = await db.priority.findUnique({
    where: { id: params.id },
    select: { orgId: true, createdBy: true, owner: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Priority not found" }, { status: 404 });
  if (existing.orgId !== orgId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  // Edit permission: creator, assignee, admin, or super-admin
  const canEdit = await canEditPriority(userId, orgId, {
    createdBy: existing.createdBy,
    owner: existing.owner,
  });
  if (!canEdit) {
    return NextResponse.json(
      { success: false, error: "Only the creator, assignee, or an admin can edit this priority." },
      { status: 403 },
    );
  }

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

export const DELETE = withTenantAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const existing = await db.priority.findUnique({
    where: { id: params.id },
    select: { orgId: true, createdBy: true, owner: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Priority not found" }, { status: 404 });
  if (existing.orgId !== orgId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  // Edit permission: creator, assignee, admin, or super-admin
  const canEdit = await canEditPriority(userId, orgId, {
    createdBy: existing.createdBy,
    owner: existing.owner,
  });
  if (!canEdit) {
    return NextResponse.json(
      { success: false, error: "Only the creator, assignee, or an admin can delete this priority." },
      { status: 403 },
    );
  }

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
