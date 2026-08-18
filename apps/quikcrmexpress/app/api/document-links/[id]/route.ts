import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { deleteDocumentLink } from "@/lib/services/documents/document-links";
import { FolderServiceError } from "@/lib/services/document-folders/scope";

export const runtime = "nodejs";

function ok<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
}

function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "documents", "edit");
    const { id } = await params;
    await deleteDocumentLink(user, id);
    return ok({ deleted: true });
  } catch (e: unknown) {
    if (e instanceof FolderServiceError) return fail(e.statusCode, e.message);
    return errorResponse(e);
  }
}
