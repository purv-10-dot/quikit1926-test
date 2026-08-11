import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  deleteFolder,
  FolderServiceError,
  getFolder,
  renameFolder,
} from "@/lib/services/document-folders/folder-service";
import { buildFolderBreadcrumbs } from "@/lib/services/document-folders/breadcrumbs";

export const runtime = "nodejs";

function ok<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
}

function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "documents", "view");
    const { id } = await params;
    const folder = await getFolder(user, id);
    const breadcrumbs = await buildFolderBreadcrumbs(user.tenantId, id);
    return ok({ folder, breadcrumbs });
  } catch (e: unknown) {
    if (e instanceof FolderServiceError) return fail(e.statusCode, e.message);
    return errorResponse(e);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "documents", "edit");
    const { id } = await params;
    const body = (await req.json()) as { name?: string };
    const folder = await renameFolder(user, id, { name: body.name ?? "" });
    return ok(folder);
  } catch (e: unknown) {
    if (e instanceof FolderServiceError) return fail(e.statusCode, e.message);
    return errorResponse(e);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "documents", "edit");
    const { id } = await params;
    const recursive = req.nextUrl.searchParams.get("recursive") === "true";
    await deleteFolder(user, id, recursive);
    return ok({ deleted: true });
  } catch (e: unknown) {
    if (e instanceof FolderServiceError) return fail(e.statusCode, e.message);
    return errorResponse(e);
  }
}
