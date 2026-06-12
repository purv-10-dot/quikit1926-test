import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { listDocumentPickerFiles } from "@/lib/services/documents/document-picker";
import { isDocumentRefType } from "@/lib/services/documents/types";
import { FolderServiceError } from "@/lib/services/document-folders/scope";

export const runtime = "nodejs";

function ok<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
}

function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "documents", "view");

    const params = new URL(req.url).searchParams;
    const refTypeRaw = params.get("refType")?.trim();
    const refType =
      refTypeRaw && isDocumentRefType(refTypeRaw) ? refTypeRaw : undefined;

    const excludeFolderRaw = params.get("excludeFolderId");
    const excludeFolderId =
      excludeFolderRaw === "null" || excludeFolderRaw === "" ? null : excludeFolderRaw ?? undefined;

    const data = await listDocumentPickerFiles(user, {
      location: params.get("location") ?? "root",
      q: params.get("q")?.trim() || undefined,
      refType,
      recent: params.get("recent") === "1",
      page: Math.max(1, Number(params.get("page") ?? "1") || 1),
      pageSize: Math.min(50, Math.max(1, Number(params.get("pageSize") ?? "25") || 25)),
      excludeTargetFolderId: excludeFolderId,
      excludeRefType: params.get("excludeRefType") ?? null,
      excludeRefId: params.get("excludeRefId") ?? null,
    });
    return ok(data);
  } catch (e: unknown) {
    if (e instanceof FolderServiceError) return fail(e.statusCode, e.message);
    return errorResponse(e);
  }
}
