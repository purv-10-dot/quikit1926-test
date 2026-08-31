import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { updateClientSchema } from "@/lib/schemas/clientMeetingsSchema";
import { toErrorMessage } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext, classifyUpdateAction, diffFields, CLIENT_AUDIT_FIELDS } from "@/lib/audit";
import { splitInviteEmails } from "@/lib/meetings/inviteLists";
import { emitClientUpdated, emitClientDeleted } from "@/lib/services/workflowEvents";

// RBAC v2: same per-action gate as the list endpoint. View/update/delete are
// gated by the corresponding ClientMaster permission grants on the caller's
// role (replaces the legacy `requireAdmin()` gate on PUT/DELETE).
const auth = withOrgAuthForResource("clientMeetings.clients", "ClientMaster");

/** GET /api/client-meetings/clients/[id] — detail including team-member list. */
export const GET = auth.view<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const row = await db.client.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    include: {
      // Include `member.deletedAt` so soft-deleted members are filtered out of
      // the roster below — consistent with the list/dashboard/export routes. A
      // deleted ClientMember keeps its ClientTeamMember link, so without this
      // filter the detail payload would surface members the edit form can't show.
      teamMembers: { include: { member: { select: { id: true, name: true, email: true, deletedAt: true } } } },
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
      teamMembers: row.teamMembers
        .filter(tm => !tm.member.deletedAt)
        .map(tm => ({
          id: tm.member.id,
          name: tm.member.name,
          email: tm.member.email,
          // Consumers need to know who was EXPECTED, not just who is listed —
          // the transcript-upload attendee picker pre-ticks on this.
          attendanceType: tm.attendanceType,
        })),
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
      // Tracked so a Required→Optional change shows in Change History rather
      // than passing silently: it materially changes the attendance figures.
      teamMemberTypes: Object.fromEntries(
        existing.teamMembers.map(tm => [tm.clientMemberId, tm.attendanceType]),
      ),
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
          weeklyDay:       d.weeklyDay === undefined ? undefined : (d.weeklyDay ?? null),
          dailyDays:       d.dailyDays === undefined ? undefined : (d.dailyDays ?? []),
          meetingUntil:    d.meetingUntil === undefined ? undefined : (d.meetingUntil ? new Date(d.meetingUntil) : null),
          updatedBy: userId,
        },
      });
      if (d.teamMemberIds !== undefined) {
        await tx.clientTeamMember.deleteMany({ where: { clientId: params.id } });
        if (d.teamMemberIds.length > 0) {
          await tx.clientTeamMember.createMany({
            data: d.teamMemberIds.map(cmId => ({
              clientId: params.id,
              clientMemberId: cmId,
              orgId,
              attendanceType: d.teamMemberTypes?.[cmId] ?? "REQUIRED",
            })),
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
      teamMemberTypes:
        d.teamMemberIds === undefined
          ? oldSnapshot.teamMemberTypes
          : Object.fromEntries(
              d.teamMemberIds.map(id => [id, d.teamMemberTypes?.[id] ?? "REQUIRED"]),
            ),
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

    // ── Centralized audit (dual-write) ── field-level diff; isActive change →
    // STATUS pill (via classifyUpdateAction). Skipped when nothing changed.
    const auditChanges = diffFields(oldSnapshot, newSnapshot, { include: CLIENT_AUDIT_FIELDS });

    // Team-member add/remove: the diff is on `teamMemberIds`, so the timeline
    // would otherwise show raw ids. Resolve ids → names (point-in-time,
    // denormalized) so it reads "Team Members + Alice − Bob".
    const tmChange = auditChanges.find((c) => c.fieldName === "teamMemberIds");
    if (tmChange) {
      const ids = [
        ...new Set([
          ...(((tmChange.oldValue as string[] | null) ?? [])),
          ...(((tmChange.newValue as string[] | null) ?? [])),
        ]),
      ];
      const mems = ids.length
        ? await db.clientMember.findMany({ where: { id: { in: ids }, orgId }, select: { id: true, name: true } })
        : [];
      const nameOf = new Map(mems.map((m) => [m.id, m.name]));
      const toNames = (v: unknown) =>
        Array.isArray(v) ? v.map((id) => nameOf.get(String(id)) ?? String(id)) : v;
      tmChange.oldValue = toNames(tmChange.oldValue);
      tmChange.newValue = toNames(tmChange.newValue);
    }

    await audit.log({
      entityType: "CLIENT",
      entityId: params.id,
      action: classifyUpdateAction(auditChanges.map((c) => c.fieldName)),
      actor: { userId, orgId, teamId: null },
      changes: auditChanges,
      skipIfNoChanges: true,
      ...requestContext(request),
    });

    // Fire a QuikFlow event only when something actually changed. Load the final
    // meeting windows + team-member emails so a calendar workflow updates the
    // existing Teams events (idempotent via WfCalendarLink).
    if (auditChanges.length) {
      const finalClient = await db.client.findUnique({
        where: { id: params.id },
        select: {
          dailyStartTime: true,
          dailyEndTime: true,
          weeklyStartTime: true,
          weeklyEndTime: true,
          weeklyDay: true,
          dailyDays: true,
          meetingUntil: true,
          startDate: true,
          // attendanceType decides which of the invite's two attendee lists a
          // member lands in — see lib/meetings/inviteLists.ts.
          teamMembers: { select: { attendanceType: true, member: { select: { email: true } } } },
        },
      });
      const invite = splitInviteEmails(
        (finalClient?.teamMembers ?? []).map((tm) => ({
          email: tm.member?.email,
          attendanceType: tm.attendanceType,
        })),
      );
      emitClientUpdated({
        orgId,
        clientId: params.id,
        name: newSnapshot.name,
        dailyStartTime: finalClient?.dailyStartTime ?? null,
        dailyEndTime: finalClient?.dailyEndTime ?? null,
        weeklyStartTime: finalClient?.weeklyStartTime ?? null,
        weeklyEndTime: finalClient?.weeklyEndTime ?? null,
        teamMemberEmails: invite.required,
        optionalMemberEmails: invite.optional,
        weeklyDay: finalClient?.weeklyDay ?? "",
        dailyDays: finalClient?.dailyDays ?? [],
        meetingUntil: finalClient?.meetingUntil ? finalClient.meetingUntil.toISOString().slice(0, 10) : "",
        startDate: finalClient?.startDate ? finalClient.startDate.toISOString().slice(0, 10) : "",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to update client") }, { status: 500 });
  }
});

/** DELETE /api/client-meetings/clients/[id] — gated by `ClientMaster.delete`. Soft delete. */
export const DELETE = auth.delete<{ id: string }>(async ({ orgId, userId }, request, { params }) => {
  try {
    const existing = await db.client.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

    // Optional (never required) reason — shown in the timeline if provided.
    const body = await request.json().catch(() => ({}));
    const reason =
      typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

    await db.client.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
    await writeAuditLog({
      orgId, actorId: userId, action: "DELETE",
      entityType: "Client", entityId: params.id,
      oldValues: { name: existing.name, isActive: existing.isActive },
      reason: reason ?? undefined,
    });

    // ── Centralized audit (dual-write) ── DELETE with a snapshot of the
    // deleted client (name = identity) so the timeline shows what was removed.
    await audit.log({
      entityType: "CLIENT",
      entityId: params.id,
      action: "DELETE",
      actor: { userId, orgId, teamId: null },
      reason,
      snapshot: { name: existing.name, isActive: existing.isActive, description: existing.description },
      ...requestContext(request),
    });

    // Let a QuikFlow workflow tear down the Teams events it created for this client.
    emitClientDeleted({ orgId, clientId: params.id, name: existing.name });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to delete client") }, { status: 500 });
  }
});
