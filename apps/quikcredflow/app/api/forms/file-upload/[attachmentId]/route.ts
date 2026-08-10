import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import {
  getDispositionAttachmentUrl,
  FileUploadError,
} from "@/lib/services/forms/file-upload.service";

export const runtime = "nodejs";

/**
 * GET /api/forms/file-upload/[attachmentId] — ACL-gated presigned download URL.
 *
 * The service refuses (403) an attachment whose parent activity is outside the
 * caller's account scope, so files never leak across scopes (AC-RE-17).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const { attachmentId } = await params;
    const url = await getDispositionAttachmentUrl(user, attachmentId);
    return NextResponse.json({ success: true, data: { url } });
  } catch (e) {
    if (e instanceof FileUploadError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
