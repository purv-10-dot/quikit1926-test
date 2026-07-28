import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, forbidden, internalError } from "@/lib/api-response";
import { shareDocumentSchema } from "@/lib/validations/documents";
import { createAuditLog } from "@/lib/utils/audit";
import { resolveDocumentAccessById } from "@/lib/rbac/document-access";

export const POST = withAuth(async (req: NextRequest, ctx, params) => {
  try {
    const { orgId, userId } = ctx;
    const { id } = params;
    const body = await req.json();
    const parsed = shareDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    // You may only share a document you can actually access (owner or in your
    // read-scope) — previously any write-holder could share ANY doc in the org.
    const access = await resolveDocumentAccessById(ctx, id);
    if (!access.doc) return notFound("Document not found");
    if (!access.allow) return forbidden("You don't have access to this document");

    // Every recipient must be a real, in-org employee.
    const recipients = [...new Set(parsed.data.sharedWith)];
    const found = await prisma.employee.findMany({
      where: { id: { in: recipients }, orgId, deletedAt: null },
      select: { id: true },
    });
    if (found.length !== recipients.length) {
      return validationError("One or more recipients are not in your organization.");
    }

    const shares = await prisma.$transaction(
      recipients.map((recipient) =>
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
      metadata: { recipients: recipients.length, accessLevel: parsed.data.accessLevel },
    });

    return successResponse({ shares, count: shares.length }, undefined, 201);
  } catch (error) {
    console.error("POST /documents/[id]/share error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.document.write"] });

export const GET = withAuth(async (_req: NextRequest, ctx, params) => {
  try {
    // Must be able to see the document before seeing who it's shared with.
    const access = await resolveDocumentAccessById(ctx, params.id);
    if (!access.doc) return notFound("Document not found");
    if (!access.allow) return forbidden("You don't have access to this document");

    const shares = await prisma.documentShare.findMany({
      where: { orgId: ctx.orgId, documentId: params.id },
      orderBy: { createdAt: "desc" },
    });
    return successResponse(shares);
  } catch (error) {
    console.error("GET /documents/[id]/share error:", error);
    return internalError();
  }
});
