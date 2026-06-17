import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { updateDocumentSchema } from "@/lib/validations/documents";
import { createAuditLog } from "@/lib/utils/audit";
import { extractDocumentText } from "@/lib/ai/extract-document-text";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const doc = await prisma.document.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        acknowledgments: true,
        shares: true,
        versions: { select: { id: true, version: true, createdAt: true }, orderBy: { version: "desc" } },
      },
    });
    if (!doc) return notFound("Document not found");
    return successResponse(doc);
  } catch (error) {
    console.error("GET /documents/[id] error:", error);
    return internalError();
  }
});

export const PUT = withAuth(async (req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    const { id } = params;
    const body = await req.json();
    const parsed = updateDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const existing = await prisma.document.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Document not found");

    // Self-only writers can only edit documents they own (employeeId === self).
    const isSelfOnly =
      !permissions.includes("*") &&
      !permissions.includes("hrms.document.write") &&
      permissions.includes("hrms.document.write_self");
    if (isSelfOnly && existing.employeeId !== userId) {
      return validationError("You can only edit documents in your own vault.");
    }

    const { expiryDate, tags, metadata, ...rest } = parsed.data;

    const doc = await prisma.document.update({
      where: { id },
      data: {
        ...rest,
        ...(expiryDate !== undefined && { expiryDate: expiryDate ? new Date(expiryDate) : null }),
        ...(tags !== undefined && { tags: tags ?? undefined }),
        ...(metadata !== undefined && { metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined }),
        updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Update", entityType: "Document", entityId: id, changes: parsed.data });

    if (parsed.data.fileUrl && parsed.data.fileUrl !== existing.fileUrl) {
      void extractDocumentText(doc.id, orgId);
    }

    return successResponse(doc);
  } catch (error) {
    console.error("PUT /documents/[id] error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.document.write", "hrms.document.write_self"],
  anyPermission: true,
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    const { id } = params;
    const existing = await prisma.document.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Document not found");

    const isSelfOnly =
      !permissions.includes("*") &&
      !permissions.includes("hrms.document.write") &&
      permissions.includes("hrms.document.write_self");
    if (isSelfOnly && existing.employeeId !== userId) {
      return validationError("You can only delete documents in your own vault.");
    }

    await prisma.document.update({
      where: { id },
      data: { deletedAt: new Date(), status: "Archived", updatedBy: userId },
    });

    await createAuditLog({ orgId, userId, action: "Delete", entityType: "Document", entityId: id });
    return successResponse({ id, deleted: true });
  } catch (error) {
    console.error("DELETE /documents/[id] error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.document.write", "hrms.document.write_self"],
  anyPermission: true,
});
