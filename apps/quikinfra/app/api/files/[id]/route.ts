import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/context";
import { fileService, FileError } from "@/lib/storage";

/**
 * GET    /api/files/:id         — returns a short-lived presigned download URL
 * DELETE /api/files/:id         — soft-delete (or hard-delete with ?hard=true)
 *
 * Both routes are tenant-scoped — a user can only touch files that belong
 * to their tenant. 404 is returned for cross-tenant attempts (don't leak
 * existence).
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctxOrResponse = await requireAuth();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  try {
    const signed = await fileService.getDownloadUrl(ctx, params.id);
    return NextResponse.json(signed);
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctxOrResponse = await requireAuth();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  try {
    const { searchParams } = new URL(req.url);
    const hardDelete = searchParams.get("hard") === "true";
    const reason = searchParams.get("reason") ?? undefined;

    await fileService.deleteFile(ctx, params.id, { hardDelete, reason });
    return NextResponse.json({ success: true, fileId: params.id, hardDelete });
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
