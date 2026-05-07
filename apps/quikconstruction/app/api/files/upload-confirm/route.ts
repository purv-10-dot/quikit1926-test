import { NextRequest, NextResponse } from "next/server";
import { requireAuth, badRequest } from "@/lib/auth/context";
import { fileService, FileError } from "@/lib/storage";

/**
 * POST /api/files/upload-confirm
 *
 * Body: { fileId: string, checksum?: string }
 *
 * Called by the client after it successfully PUTs the file body to the
 * presigned URL. Server issues a HEAD against the object store to verify
 * the object exists and has the expected size, then flips the metadata row
 * to "active" inside a transaction and emits an audit entry.
 *
 * 409 SIZE_MISMATCH if the reported size doesn't match — metadata row +
 * object are both deleted so nothing leaks.
 * 409 UPLOAD_NOT_FOUND if the client never actually PUT the bytes.
 */
export async function POST(req: NextRequest) {
  const ctxOrResponse = await requireAuth();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  try {
    const body = await req.json();
    if (!body.fileId) return badRequest("fileId is required");

    const metadata = await fileService.confirmUpload(ctx, String(body.fileId), {
      checksum: body.checksum ?? undefined,
    });
    return NextResponse.json(metadata);
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
