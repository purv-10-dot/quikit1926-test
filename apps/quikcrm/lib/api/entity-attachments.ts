import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  deleteEntityDocument,
  DocumentParentError,
  getEntityDocumentDownloadUrl,
  getEntityDocumentPreview,
  listEntityDocuments,
  uploadEntityDocument,
} from "@/lib/services/documents/document-service";
import { REF_CONFIG } from "@/lib/services/documents/ref-config";
import type { DocumentRefType } from "@/lib/services/documents/types";

export const runtime = "nodejs";

function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init);
}

function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export function createAttachmentRouteHandlers(refType: DocumentRefType) {
  const cfg = REF_CONFIG[refType];

  async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    try {
      const user = await requireApiUser();
      if (isResponse(user)) return user;
      await assertModule(user, cfg.module, "view");
      const { id } = await params;
      const folderIdParam = req.nextUrl.searchParams.get("folderId");
      const folderId =
        folderIdParam === "null" || folderIdParam === ""
          ? null
          : folderIdParam ?? undefined;
      const data = await listEntityDocuments(user, refType, id, folderId);
      return ok(data);
    } catch (e: unknown) {
      if (e instanceof DocumentParentError) {
        return fail(e.statusCode, e.message);
      }
      return errorResponse(e);
    }
  }

  async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    try {
      const user = await requireApiUser();
      if (isResponse(user)) return user;
      await assertModule(user, cfg.module, "edit");
      const { id } = await params;
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return fail(400, "file is required");
      }
      const folderIdRaw = form.get("folderId");
      const folderId =
        typeof folderIdRaw === "string" && folderIdRaw.length > 0 ? folderIdRaw : null;
      const data = await uploadEntityDocument(user, refType, id, file, folderId);
      return ok(data, { status: 201 });
    } catch (e: unknown) {
      if (e instanceof DocumentParentError) {
        return fail(e.statusCode, e.message);
      }
      const message = e instanceof Error ? e.message : "Upload failed";
      return fail(400, message);
    }
  }

  return { GET, POST };
}

export function createAttachmentDeleteHandler(refType: DocumentRefType) {
  const cfg = REF_CONFIG[refType];

  return async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string; aid: string }> },
  ) {
    try {
      const user = await requireApiUser();
      if (isResponse(user)) return user;
      await assertModule(user, cfg.module, "edit");
      const { id, aid } = await params;
      await deleteEntityDocument(user, refType, id, aid);
      return ok({ deleted: true });
    } catch (e: unknown) {
      if (e instanceof DocumentParentError) {
        return fail(e.statusCode, e.message);
      }
      return errorResponse(e);
    }
  };
}

export function createAttachmentDownloadHandler(refType: DocumentRefType) {
  const cfg = REF_CONFIG[refType];

  return async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; aid: string }> },
  ) {
    try {
      const user = await requireApiUser();
      if (isResponse(user)) return user;
      await assertModule(user, cfg.module, "view");
      const { id, aid } = await params;
      if (req.nextUrl.searchParams.get("preview") === "1") {
        const { buffer, fileName, contentType } = await getEntityDocumentPreview(
          user,
          refType,
          id,
          aid,
        );
        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
            "Cache-Control": "private, no-store",
          },
        });
      }
      const { redirectUrl, fileName } = await getEntityDocumentDownloadUrl(
        user,
        refType,
        id,
        aid,
      );
      return NextResponse.redirect(redirectUrl, {
        status: 302,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        },
      });
    } catch (e: unknown) {
      if (e instanceof DocumentParentError) {
        return fail(e.statusCode, e.message);
      }
      return errorResponse(e);
    }
  };
}
