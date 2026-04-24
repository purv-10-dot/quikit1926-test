import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { readUpload } from "@/lib/storage";

const withTenantAuth = withTenantAuthForModule("documents");

export const GET = withTenantAuth<{ id: string }>(async ({ tenantId }, _req, { params }) => {
  const doc = await db.cnDocument.findFirst({ where: { id: params.id, tenantId, deletedAt: null } });
  if (!doc) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  try {
    const buf = await readUpload(doc.storagePath);
    // Buffer → Uint8Array for Response BodyInit compat
    const body = new Uint8Array(buf);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `attachment; filename="${doc.fileName}"`,
        "Content-Length": String(doc.sizeBytes),
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Read failed" }, { status: 500 });
  }
});
