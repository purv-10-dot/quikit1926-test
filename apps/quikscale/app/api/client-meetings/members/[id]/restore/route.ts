import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext } from "@/lib/audit";

const withOrgAuth = withOrgAuthForModule("clientMeetings.members");

/** POST /api/client-meetings/members/[id]/restore — undo soft delete. */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, request, { params }) => {
  const existing = await db.clientMember.findFirst({
    where: { id: params.id, orgId, deletedAt: { not: null } },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Member not found in trash" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const reason =
    typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  await db.clientMember.update({ where: { id: params.id }, data: { deletedAt: null, updatedBy: userId } });
  await writeAuditLog({
    orgId, actorId: userId, action: "RESTORE",
    entityType: "ClientMember", entityId: params.id,
    newValues: { name: existing.name, email: existing.email },
    reason: reason ?? undefined,
  });

  // ── Centralized audit (dual-write) ── RESTORE event for the timeline.
  await audit.log({
    entityType: "CLIENT_MEMBER",
    entityId: params.id,
    action: "RESTORE",
    actor: { userId, orgId, teamId: null },
    reason,
    snapshot: { name: existing.name, email: existing.email },
    ...requestContext(request),
  });

  return NextResponse.json({ success: true });
});
