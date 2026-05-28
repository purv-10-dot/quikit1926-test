import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/auth/context";
import { fileService, FileError, type AttachmentEntityType } from "@/lib/storage";

/**
 * POST /api/files/upload-init
 *
 * Body: {
 *   entityType: "grn" | "po" | "dpr" | "rab" | "boq_import" | "work_order" |
 *               "safety_incident" | "quality_inspection" | "project_document",
 *   entityId: string,
 *   projectId?: string,
 *   companyId?: string,
 *   fileName: string,
 *   mimeType: string,
 *   sizeBytes: number
 * }
 *
 * Response: {
 *   fileId, objectKey, bucket, storageKind,
 *   upload: { method, url, headers, expiresIn }
 * }
 *
 * Flow: client calls this → receives presigned URL → PUTs bytes directly to
 * object storage → calls `/api/files/upload-confirm` with fileId to flip
 * status from "pending_upload" → "active".
 */
export async function POST(req: NextRequest) {
  const ctxOrResponse = await requireAuth();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  try {
    const body = await req.json();
    if (!body.entityType || !body.entityId || !body.fileName || !body.mimeType || !body.sizeBytes) {
      return badRequest(
        "Required fields: entityType, entityId, fileName, mimeType, sizeBytes"
      );
    }

    const result = await fileService.initUpload(ctx, {
      entityType: body.entityType as AttachmentEntityType,
      entityId: String(body.entityId),
      projectId: body.projectId ?? null,
      companyId: body.companyId ?? null,
      fileName: String(body.fileName),
      mimeType: String(body.mimeType),
      sizeBytes: Number(body.sizeBytes),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    if (err instanceof FileError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus }
      );
    }
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
