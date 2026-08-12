import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import {
  saveDispositionUpload,
  FileUploadError,
} from "@/lib/services/forms/file-upload.service";

export const runtime = "nodejs";

/**
 * POST /api/forms/file-upload (multipart)
 *   fields: file, activityId, formSetVersionId, fieldKey
 *
 * No assertModule gate: agents fill user_picker/file_upload fields at runtime,
 * not just admins. The service enforces the FR-RE size/type limits AND checks
 * the caller's access to the target activity before storing — so a caller
 * cannot attach to an out-of-scope activity (no IDOR), and an invalid file
 * never produces a partial save.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const form = await req.formData();
    const file = form.get("file");
    const activityId = form.get("activityId");
    const formSetVersionId = form.get("formSetVersionId");
    const fieldKey = form.get("fieldKey");

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "file is required" }, { status: 400 });
    }
    if (
      typeof activityId !== "string" ||
      typeof formSetVersionId !== "string" ||
      typeof fieldKey !== "string" ||
      !activityId ||
      !formSetVersionId ||
      !fieldKey
    ) {
      return NextResponse.json(
        { success: false, error: "activityId, formSetVersionId and fieldKey are required" },
        { status: 400 },
      );
    }

    const data = await saveDispositionUpload({
      user,
      activityId,
      formSetVersionId,
      fieldKey,
      file,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (e) {
    if (e instanceof FileUploadError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
