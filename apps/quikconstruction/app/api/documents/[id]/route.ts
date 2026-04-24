import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { deleteUpload } from "@/lib/storage";

const withTenantAuth = withTenantAuthForModule("documents");

export const DELETE = withTenantAuth<{ id: string }>(async ({ tenantId }, _req, { params }) => {
  const doc = await db.cnDocument.findFirst({ where: { id: params.id, tenantId }, select: { id: true, storagePath: true } });
  if (!doc) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  await db.cnDocument.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
  await deleteUpload(doc.storagePath);
  return NextResponse.json({ success: true });
});
