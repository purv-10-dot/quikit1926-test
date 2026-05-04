import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { writeAuditLog } from "@/lib/api/auditLog";

const withTenantAuth = withTenantAuthForModule("clientMeetings.members");

/** POST /api/client-meetings/members/[id]/restore — undo soft delete. */
export const POST = withTenantAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const existing = await db.clientMember.findFirst({
    where: { id: params.id, orgId, deletedAt: { not: null } },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Member not found in trash" }, { status: 404 });

  await db.clientMember.update({ where: { id: params.id }, data: { deletedAt: null, updatedBy: userId } });
  await writeAuditLog({
    orgId, actorId: userId, action: "RESTORE",
    entityType: "ClientMember", entityId: params.id,
    newValues: { name: existing.name, email: existing.email },
  });
  return NextResponse.json({ success: true });
});
