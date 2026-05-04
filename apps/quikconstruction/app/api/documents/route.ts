import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { saveUpload } from "@/lib/storage";

const withTenantAuth = withTenantAuthForModule("documents");

export const GET = withTenantAuth(async ({ orgId }, req) => {
  const refType = req.nextUrl.searchParams.get("refType") || undefined;
  const refId = req.nextUrl.searchParams.get("refId") || undefined;
  const list = await db.cnDocument.findMany({
    where: { orgId, deletedAt: null, ...(refType ? { refType } : {}), ...(refId ? { refId } : {}) },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

/**
 * POST /api/documents — multipart upload.
 *   fields: refType (required), refId (required), file (required)
 */
export const POST = withTenantAuth(async ({ orgId, userId }, req) => {
  const form = await req.formData();
  const refType = String(form.get("refType") ?? "");
  const refId = String(form.get("refId") ?? "");
  const file = form.get("file");
  if (!refType || !refId) return NextResponse.json({ success: false, error: "refType and refId required" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ success: false, error: "file missing" }, { status: 400 });

  try {
    const { storagePath, sizeBytes, safeName } = await saveUpload(orgId, file);
    const doc = await db.cnDocument.create({
      data: {
        orgId, refType, refId,
        fileName: safeName,
        mimeType: file.type,
        sizeBytes,
        storagePath,
        uploadedBy: userId,
      },
    });
    return NextResponse.json({ success: true, data: doc }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
});
