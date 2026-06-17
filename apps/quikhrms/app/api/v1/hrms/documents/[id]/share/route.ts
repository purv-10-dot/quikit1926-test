import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { shareDocumentSchema } from "@/lib/validations/documents";
import { createAuditLog } from "@/lib/utils/audit";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const body = await req.json();
    const parsed = shareDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const doc = await prisma.document.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!doc) return notFound("Document not found");

    const shares = await prisma.$transaction(
      parsed.data.sharedWith.map((recipient) =>
        prisma.documentShare.upsert({
          where: { orgId_documentId_sharedWith: { orgId, documentId: id, sharedWith: recipient } },
          create: {
            orgId, documentId: id, sharedWith: recipient, sharedBy: userId,
            accessLevel: parsed.data.accessLevel,
            expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
          },
          update: {
            sharedBy: userId,
            accessLevel: parsed.data.accessLevel,
            expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
          },
        }),
      ),
    );

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "DocumentShare", entityId: id,
      metadata: { recipients: parsed.data.sharedWith.length, accessLevel: parsed.data.accessLevel },
    });

    return successResponse({ shares, count: shares.length }, undefined, 201);
  } catch (error) {
    console.error("POST /documents/[id]/share error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.document.write"] });

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const shares = await prisma.documentShare.findMany({
      where: { orgId, documentId: params.id },
      orderBy: { createdAt: "desc" },
    });
    return successResponse(shares);
  } catch (error) {
    console.error("GET /documents/[id]/share error:", error);
    return internalError();
  }
});
