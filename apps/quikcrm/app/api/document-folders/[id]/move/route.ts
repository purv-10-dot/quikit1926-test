import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { FolderServiceError, moveFolder } from "@/lib/services/document-folders/folder-service";

export const runtime = "nodejs";

function ok<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
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
    const body = (await req.json()) as { parentFolderId?: string | null };
    const folder = await moveFolder(user, id, {
      parentFolderId: body.parentFolderId ?? null,
    });
    return ok(folder);
  } catch (e: unknown) {
    if (e instanceof FolderServiceError) return fail(e.statusCode, e.message);
    return errorResponse(e);
  }
}
