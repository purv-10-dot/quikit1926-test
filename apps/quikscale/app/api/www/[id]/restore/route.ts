import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";

const withOrgAuth = withOrgAuthForModule("www");

export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
  }

  const existing = await db.wWWItem.findFirst({ where: { id, orgId } });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (existing.deletedAt == null) {
    return NextResponse.json({ success: true, message: "Already active" });
  }

  const restored = await db.wWWItem.update({
    where: { id },
    data: { deletedAt: null },
    select: { id: true, what: true, deletedAt: true },
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "RESTORE",
    entityType: "WWWItem",
    entityId: id,
    newValues: restored,
  });

  return NextResponse.json({ success: true, data: restored });
});
