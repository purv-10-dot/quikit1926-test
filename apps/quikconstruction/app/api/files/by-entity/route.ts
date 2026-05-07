import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/auth/context";
import {
  fileService,
  FileError,
  type AttachmentEntityType,
} from "@/lib/storage";
import { ATTACHMENT_ENTITY_TYPES } from "@/lib/storage/file-service";

/**
 * GET /api/files/by-entity?entityType=grn&entityId=xyz
 *
 * Returns all active attachments for the given entity, most recent first.
 * Tenant-scoped.
 */
export async function GET(req: NextRequest) {
  const ctxOrResponse = await requireAuth();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  try {
    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get("entityType") as AttachmentEntityType | null;
    const entityId = searchParams.get("entityId");

    if (!entityType || !entityId) {
      return badRequest("entityType and entityId query params are required");
    }
    if (!ATTACHMENT_ENTITY_TYPES.includes(entityType)) {
      return badRequest(
        `Unknown entityType '${entityType}'. Allowed: ${ATTACHMENT_ENTITY_TYPES.join(", ")}`
      );
    }

    const rows = await fileService.listByEntity(ctx, entityType, entityId);
    return NextResponse.json({ data: rows, total: rows.length });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string; httpStatus?: number };
    if (err instanceof FileError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: e.httpStatus }
      );
    }
    return NextResponse.json({ error: e.message ?? "Internal error" }, { status: 500 });
  }
}
