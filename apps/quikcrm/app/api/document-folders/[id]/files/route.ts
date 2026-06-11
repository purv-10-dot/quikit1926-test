import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  FolderServiceError,
  uploadFileToFolder,
} from "@/lib/services/document-folders/folder-service";

export const runtime = "nodejs";

function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init);
}

function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "documents", "edit");
    const { id } = await params;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail(400, "file is required");
    const data = await uploadFileToFolder(user, id, file);
    return ok(data, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof FolderServiceError) return fail(e.statusCode, e.message);
    const message = e instanceof Error ? e.message : "Upload failed";
    return fail(400, message);
  }
}
