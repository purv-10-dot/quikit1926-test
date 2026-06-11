import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  listGlobalDocuments,
  parseGlobalDocumentsQuery,
} from "@/lib/services/documents/list-global";
import {
  FolderServiceError,
  uploadGlobalRootDocument,
} from "@/lib/services/document-folders/folder-service";

export const runtime = "nodejs";

function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init);
}

function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "documents", "view");

    const parsed = parseGlobalDocumentsQuery(new URL(req.url).searchParams);
    if ("error" in parsed) return fail(400, parsed.error);

    const data = await listGlobalDocuments(user, parsed);
    return ok(data);
  } catch (e: unknown) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "documents", "edit");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail(400, "file is required");

    const data = await uploadGlobalRootDocument(user, file);
    return ok(data, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof FolderServiceError) return fail(e.statusCode, e.message);
    return errorResponse(e);
  }
}
