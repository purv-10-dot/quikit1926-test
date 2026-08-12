import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertFolderModule } from "@/lib/api/document-folders-auth";
import { parseFolderScope, parseParentFolderId } from "@/lib/api/document-folders-parse";
import { isGlobalFolderScope } from "@/lib/services/document-folders/explorer-location";
import {
  listGlobalAggregatedTreeChildren,
  listGlobalExplorerContents,
} from "@/lib/services/document-folders/global-tree";
import {
  createFolder,
  FolderServiceError,
  listFolderContents,
  listFolderTreeChildren,
} from "@/lib/services/document-folders/folder-service";
import type { DocumentRefType } from "@/lib/services/documents/types";
import { isDocumentRefType } from "@/lib/services/documents/types";

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
    const params = new URL(req.url).searchParams;
    const scopeParsed = parseFolderScope(params);
    if ("error" in scopeParsed) return fail(400, scopeParsed.error);
    await assertFolderModule(user, scopeParsed, "view");

    const aggregate = params.get("aggregate") === "1" && isGlobalFolderScope(scopeParsed);

    if (params.get("tree") === "1") {
      const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
      const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? "50") || 50));

      if (aggregate) {
        const parentId = params.get("parentId") ?? params.get("parentFolderId");
        const parsedParent =
          parentId === "null" || parentId === "" || !parentId ? null : parentId;
        const result = await listGlobalAggregatedTreeChildren(user, parsedParent, {
          page,
          pageSize,
        });
        return ok({ folders: result.nodes, ...result });
      }

      const parentFolderId = parseParentFolderId(params);
      const folders = await listFolderTreeChildren(user, scopeParsed, parentFolderId);
      return ok({ folders });
    }

    const folderIdRaw = params.get("folderId");
    const folderId =
      folderIdRaw === "null" || folderIdRaw === "" || !folderIdRaw ? null : folderIdRaw;

    const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? "25") || 25));
    const q = params.get("q")?.trim() || undefined;

    if (aggregate) {
      const location = params.get("location") ?? "root";
      const data = await listGlobalExplorerContents(user, location, { q, page, pageSize });
      return ok(data);
    }

    const data = await listFolderContents(user, {
      folderId,
      scope: scopeParsed,
      q,
      page,
      pageSize,
    });
    return ok(data);
  } catch (e: unknown) {
    if (e instanceof FolderServiceError) return fail(e.statusCode, e.message);
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const body = (await req.json()) as {
      name?: string;
      parentFolderId?: string | null;
      refType?: string | null;
      refId?: string | null;
    };

    const refType =
      body.refType && isDocumentRefType(body.refType) ? (body.refType as DocumentRefType) : null;

    if (body.refType && body.refType !== "" && !refType) return fail(400, "Invalid refType");

    const scope = {
      refType: refType ?? null,
      refId: body.refId ?? null,
    };
    await assertFolderModule(user, scope, "edit");

    const data = await createFolder(user, {
      name: body.name ?? "",
      parentFolderId: body.parentFolderId ?? null,
      refType: refType ?? null,
      refId: body.refId ?? null,
    });
    return ok(data, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof FolderServiceError) return fail(e.statusCode, e.message);
    return errorResponse(e);
  }
}
