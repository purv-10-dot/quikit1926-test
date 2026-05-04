import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { logAudit } from "@/lib/audit";

const withTenantAuth = withTenantAuthForModule("finance");

export const DELETE = withTenantAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const note = await db.cnCreditNote.findFirst({ where: { id: params.id, orgId }, select: { id: true, status: true, noteNumber: true } });
  if (!note) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (note.status === "applied") return NextResponse.json({ success: false, error: "Applied credit note cannot be deleted; cancel it first" }, { status: 400 });
  await db.cnCreditNote.update({ where: { id: note.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  await logAudit({ orgId, userId, actionType: "delete", entityType: "cnCreditNote", entityId: note.id, entityRef: note.noteNumber });
  return NextResponse.json({ success: true });
});
