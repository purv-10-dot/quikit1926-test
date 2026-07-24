import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, forbidden, notFound, internalError } from "@/lib/api-response";
import { extractDocumentText } from "@/lib/ai/extract-document-text";
import { prisma } from "@/lib/prisma";
import { resolveDocumentAccessById } from "@/lib/rbac/document-access";

/** POST /api/v1/hrms/documents/:id/extract — manually trigger text extraction (synchronous wait). */
export const POST = withAuth(async (_req: NextRequest, ctx, params) => {
  try {
    const { orgId } = ctx;
    // Access gate — you must be able to read this document to extract its text.
    const access = await resolveDocumentAccessById(ctx, params.id);
    if (!access.doc) return notFound("Document not found");
    if (!access.allow) return forbidden("You don't have access to this document");

    const result = await extractDocumentText(params.id, orgId);
    const doc = await prisma.document.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, title: true, fileType: true, metadata: true },
    });
    const meta = (doc?.metadata as { extractedText?: string; extractedAt?: string } | null) ?? null;
    return successResponse({
      id: doc?.id,
      title: doc?.title,
      fileType: doc?.fileType,
      extracted: !!meta?.extractedText,
      length: meta?.extractedText?.length ?? 0,
      extractedAt: meta?.extractedAt ?? null,
      diagnostics: result,
    });
  } catch (error) {
    console.error("POST /documents/:id/extract error:", error);
    return internalError(error instanceof Error ? error.message : "Extraction failed");
  }
}, {
  requiredPermissions: ["hrms.document.read", "hrms.document.read_team", "hrms.document.read_self"],
  anyPermission: true,
  // Each extraction runs a Gemini call — cap it per user.
  rateLimit: { max: 10, windowSec: 60, by: "user" },
});
