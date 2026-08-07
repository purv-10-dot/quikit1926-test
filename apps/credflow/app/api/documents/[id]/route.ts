import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertDocumentParent } from "@/lib/services/documents/ref-config";
import type { DocumentRefType } from "@/lib/services/documents/types";
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

    const doc = await prisma.qcfDocument.findFirst({
      where: { id, orgId: user.orgId, deletedAt: null },
    });
    if (!doc) return fail(404, "Document not found");

    await assertDocumentParent(
      user,
      doc.refType as DocumentRefType | "global",
      doc.refId,
    );

    const canDelete = user.role === "Administrator" || doc.uploadedBy === user.userId;
    if (!canDelete) return fail(403, "Forbidden");

    await prisma.qcfDocument.update({
      where: { id: doc.id },
      data: { deletedAt: new Date() },
    });

    return ok({ deleted: true });
  } catch (e: unknown) {
    if (e instanceof FolderServiceError) return fail(e.statusCode, e.message);
    return errorResponse(e);
  }
}
