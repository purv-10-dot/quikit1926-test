import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, withServiceAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, forbidden, internalError } from "@/lib/api-response";
import { updateDocumentSchema } from "@/lib/validations/documents";
import { createAuditLog } from "@/lib/utils/audit";
import { extractDocumentText } from "@/lib/ai/extract-document-text";
import { resolveScope, employeeScopeFilter, getCallerEmployeeId } from "@/lib/rbac/scope";

export const GET = withServiceAuth(async (_req: NextRequest, ctx, params) => {
  try {
    const { orgId } = ctx;
    const doc = await prisma.document.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        acknowledgments: true,
        shares: true,
        versions: { select: { id: true, version: true, createdAt: true }, orderBy: { version: "desc" } },
      },
    });
    if (!doc) return notFound("Document not found");

    // Access gate — previously ANY org member could open ANY document by id.
    // Allow only: company-wide docs (no owner), the owner, a share recipient,
    // or a caller whose read-scope covers the owning employee.
    const scope = resolveScope(ctx, {
      all: "hrms.document.read",
      team: "hrms.document.read_team",
      self: "hrms.document.read_self",
    });
    const sf = await employeeScopeFilter(ctx, scope);
    if (!sf.allow) return forbidden("No document read permission");
    const callerId = await getCallerEmployeeId(ctx);
    const allowed =
      doc.employeeId === null ||                                            // company-wide
      sf.employeeIds === undefined ||                                       // unrestricted read
      (!!doc.employeeId && sf.employeeIds.includes(doc.employeeId)) ||      // owner in read-scope
      (!!callerId && doc.employeeId === callerId) ||                        // own document
      (!!callerId && doc.shares.some((s) => s.sharedWith === callerId       // shared with caller
        && (!s.expiresAt || s.expiresAt.getTime() > Date.now())));          // …via a LIVE (non-expired) share
    if (!allowed) return forbidden("You don't have access to this document");

    // Enrich acknowledgment entries with employee names (no relation exists on
    // DocumentAcknowledgment — resolve by id, scoped to the org).
    const ackEmpIds = [...new Set(doc.acknowledgments.map((a) => a.employeeId))];
    const ackEmps = ackEmpIds.length
      ? await prisma.employee.findMany({
          where: { id: { in: ackEmpIds }, orgId, deletedAt: null },
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        })
      : [];
    const ackEmpMap = new Map(ackEmps.map((e) => [e.id, e]));
    const acknowledgments = doc.acknowledgments.map((a) => ({
      ...a,
      employee: ackEmpMap.get(a.employeeId) ?? null,
    }));

    return successResponse({ ...doc, acknowledgments });
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
