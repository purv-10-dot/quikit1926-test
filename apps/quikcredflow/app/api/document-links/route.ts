import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { createDocumentLink } from "@/lib/services/documents/document-links";
import { FolderServiceError } from "@/lib/services/document-folders/scope";

export const runtime = "nodejs";

function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init);
}

function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "documents", "edit");

    const body = (await req.json()) as {
      sourceDocumentId?: string;
      targetFolderId?: string | null;
      refType?: string | null;
      refId?: string | null;
    };

    if (!body.sourceDocumentId) return fail(400, "sourceDocumentId is required");

    const data = await createDocumentLink(user, {
      sourceDocumentId: body.sourceDocumentId,
      targetFolderId: body.targetFolderId ?? null,
      refType: body.refType ?? null,
      refId: body.refId ?? null,
    });
    return ok(data, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof FolderServiceError) return fail(e.statusCode, e.message);
    return errorResponse(e);
  }
}
