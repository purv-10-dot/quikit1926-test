import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getCrmUploadDownloadUrl, readCrmUpload } from "@/lib/storage/documents";
import { assertDocumentParent, DocumentParentError } from "@/lib/services/documents/ref-config";
import type { DocumentRefType } from "@/lib/services/documents/types";

export const runtime = "nodejs";

function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "documents", "view");
    const { id } = await params;

    const doc = await prisma.qceDocument.findFirst({
      where: { id, orgId: user.orgId, deletedAt: null },
    });
    if (!doc) return fail(404, "Document not found");

    await assertDocumentParent(user, doc.refType as DocumentRefType, doc.refId);

    if (req.nextUrl.searchParams.get("preview") === "1") {
      const buffer = await readCrmUpload(doc.storageKey);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": doc.contentType,
          "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    const redirectUrl = await getCrmUploadDownloadUrl(doc.storageKey);
    return NextResponse.redirect(redirectUrl, {
      status: 302,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
      },
    });
  } catch (e: unknown) {
    if (e instanceof DocumentParentError) {
      return fail(e.statusCode, e.message);
    }
    return errorResponse(e);
  }
}
