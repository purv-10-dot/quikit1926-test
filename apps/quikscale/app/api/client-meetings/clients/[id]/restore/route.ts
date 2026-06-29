import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext } from "@/lib/audit";

// Restore is the inverse of soft-delete; gate it behind the same
// `ClientMaster.delete` grant so the role that can move rows to Trash is
// the same role that can pull them back out.
const auth = withOrgAuthForResource("clientMeetings.clients", "ClientMaster");

/** POST /api/client-meetings/clients/[id]/restore — gated by `ClientMaster.delete`. */
export const POST = auth.delete<{ id: string }>(async ({ orgId, userId }, request, { params }) => {
  const existing = await db.client.findFirst({
    where: { id: params.id, orgId, deletedAt: { not: null } },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Client not found in trash" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const reason =
    typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  await db.client.update({ where: { id: params.id }, data: { deletedAt: null, updatedBy: userId } });
  await writeAuditLog({
    orgId, actorId: userId, action: "RESTORE",
    entityType: "Client", entityId: params.id,
    newValues: { name: existing.name },
    reason: reason ?? undefined,
  });

  // ── Centralized audit (dual-write) ── RESTORE event for the timeline.
  await audit.log({
    entityType: "CLIENT",
    entityId: params.id,
    action: "RESTORE",
    actor: { userId, orgId, teamId: null },
    reason,
    snapshot: { name: existing.name },
    ...requestContext(request),
  });

  return NextResponse.json({ success: true });
});
