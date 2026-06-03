import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { updateClientSchema } from "@/lib/schemas/clientMeetingsSchema";
import { toErrorMessage } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/auditLog";

// RBAC v2: same per-action gate as the list endpoint. View/update/delete are
// gated by the corresponding ClientMaster permission grants on the caller's
// role (replaces the legacy `requireAdmin()` gate on PUT/DELETE).
const auth = withOrgAuthForResource("clientMeetings.clients", "ClientMaster");

/** GET /api/client-meetings/clients/[id] — detail including team-member list. */
export const GET = auth.view<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const row = await db.client.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    include: {
      teamMembers: { include: { member: { select: { id: true, name: true, email: true } } } },
      memberships: {
        where: { deletedAt: null },
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!row) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  return NextResponse.json({
    success: true,
    data: {
      id: row.id, name: row.name,
      description: row.description, isActive: row.isActive,
      startDate: row.startDate?.toISOString() ?? null,
      weeklyStartTime: row.weeklyStartTime, weeklyEndTime: row.weeklyEndTime,
      dailyStartTime: row.dailyStartTime,   dailyEndTime: row.dailyEndTime,
      teamMembers: row.teamMembers.map(tm => ({ id: tm.member.id, name: tm.member.name, email: tm.member.email })),
      // Legacy tenant-user memberships (kept for now; see migration note in schema).
      members: row.memberships.map(m => ({
        id: m.id,
        userId: m.userId,
        clientRole: m.clientRole,
        name: `${m.user.firstName} ${m.user.lastName}`.trim(),
        email: m.user.email,
      })),
    },
  });
});

/** PUT /api/client-meetings/clients/[id] — gated by `ClientMaster.update`. */
export const PUT = auth.update<{ id: string }>(async ({ orgId, userId }, request, { params }) => {
  try {
    const parsed = updateClientSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });

    const existing = await db.client.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: { teamMembers: true },
    });
    if (!existing) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

    const d = parsed.data;

    if (d.teamMemberIds !== undefined && d.teamMemberIds.length) {
      const validIds = await db.clientMember.findMany({
        where: { id: { in: d.teamMemberIds }, orgId, deletedAt: null },
        select: { id: true },
      });
      if (validIds.length !== d.teamMemberIds.length)
        return NextResponse.json({ success: false, error: "One or more team members are invalid" }, { status: 400 });
    }

    const oldSnapshot = {
      name: existing.name,
      description: existing.description,
      isActive: existing.isActive,
      weeklyStartTime: existing.weeklyStartTime,
      weeklyEndTime: existing.weeklyEndTime,
      dailyStartTime: existing.dailyStartTime,
      dailyEndTime: existing.dailyEndTime,
      teamMemberIds: existing.teamMembers.map(tm => tm.clientMemberId).sort(),
    };

    await db.$transaction(async tx => {
      await tx.client.update({
        where: { id: params.id },
        data: {
          name: d.name,
          description: d.description === undefined ? undefined : (d.description ?? null),
          isActive: d.isActive,
          startDate: d.startDate === undefined ? undefined : (d.startDate ? new Date(d.startDate) : null),
          weeklyStartTime: d.weeklyStartTime,
          weeklyEndTime:   d.weeklyEndTime,
          dailyStartTime:  d.dailyStartTime,
          dailyEndTime:    d.dailyEndTime,
          updatedBy: userId,
        },
      });
      if (d.teamMemberIds !== undefined) {
        await tx.clientTeamMember.deleteMany({ where: { clientId: params.id } });
        if (d.teamMemberIds.length > 0) {
          await tx.clientTeamMember.createMany({
            data: d.teamMemberIds.map(cmId => ({ clientId: params.id, clientMemberId: cmId, orgId })),
          });
        }
      }
    });

    const newSnapshot = {
      name: d.name ?? existing.name,
      description: d.description === undefined ? existing.description : (d.description ?? null),
      isActive: d.isActive ?? existing.isActive,
      weeklyStartTime: d.weeklyStartTime ?? existing.weeklyStartTime,
      weeklyEndTime: d.weeklyEndTime ?? existing.weeklyEndTime,
      dailyStartTime: d.dailyStartTime ?? existing.dailyStartTime,
      dailyEndTime: d.dailyEndTime ?? existing.dailyEndTime,
      teamMemberIds: (d.teamMemberIds ?? oldSnapshot.teamMemberIds).slice().sort(),
    };
    const changes = Object.keys(newSnapshot).filter(k => {
      const a = (oldSnapshot as Record<string, unknown>)[k];
      const b = (newSnapshot as Record<string, unknown>)[k];
      return JSON.stringify(a) !== JSON.stringify(b);
    });
    if (changes.length) {
      await writeAuditLog({
        orgId, actorId: userId, action: "UPDATE",
        entityType: "Client", entityId: params.id,
        oldValues: oldSnapshot, newValues: newSnapshot, changes,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to update client") }, { status: 500 });
  }
});

/** DELETE /api/client-meetings/clients/[id] — gated by `ClientMaster.delete`. Soft delete. */
export const DELETE = auth.delete<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  try {
    const existing = await db.client.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

    await db.client.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
    await writeAuditLog({
      orgId, actorId: userId, action: "DELETE",
      entityType: "Client", entityId: params.id,
      oldValues: { name: existing.name, isActive: existing.isActive },
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to delete client") }, { status: 500 });
  }
});
