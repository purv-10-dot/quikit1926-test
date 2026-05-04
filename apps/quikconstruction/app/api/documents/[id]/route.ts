import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { deleteUpload } from "@/lib/storage";

const withOrgAuth = withOrgAuthForModule("documents");

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const doc = await db.cnDocument.findFirst({ where: { id: params.id, orgId }, select: { id: true, storagePath: true } });
  if (!doc) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  await db.cnDocument.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
  await deleteUpload(doc.storagePath);
  return NextResponse.json({ success: true });
});
