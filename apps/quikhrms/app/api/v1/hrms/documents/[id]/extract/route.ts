import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { extractDocumentText } from "@/lib/ai/extract-document-text";
import { prisma } from "@/lib/prisma";

/** POST /api/v1/hrms/documents/:id/extract — manually trigger text extraction (synchronous wait). */
export const POST = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const result = await extractDocumentText(params.id, orgId);
    const doc = await prisma.document.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, title: true, fileUrl: true, fileType: true, metadata: true },
    });
    const meta = (doc?.metadata as { extractedText?: string; extractedAt?: string } | null) ?? null;
    return successResponse({
      id: doc?.id,
      title: doc?.title,
      fileUrl: doc?.fileUrl,
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
});
