import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createDocumentSchema, bulkCreateDocumentSchema } from "@/lib/validations/documents";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { createAuditLog } from "@/lib/utils/audit";
import { fireWorkflow } from "@/lib/workflows/executor";
import { extractDocumentText } from "@/lib/ai/extract-document-text";
import { resolveScope, employeeScopeFilter, getCallerEmployeeId } from "@/lib/rbac/scope";
import { forbidden } from "@/lib/api-response";
import type { Prisma } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId } = ctx;
    const { searchParams } = new URL(req.url);
    const { page, limit, sort, order } = parsePagination(searchParams);
    const employeeId = searchParams.get("employeeId");
    const companyOnly = searchParams.get("companyOnly") === "true";
    const category = searchParams.get("category");
    const status = searchParams.get("status");
    const tag = searchParams.get("tag");
    const search = searchParams.get("search");
    const isTemplate = searchParams.get("isTemplate");

    const sharedWithMe = searchParams.get("sharedWithMe") === "true";

    const scope = resolveScope(ctx, {
      all: "hrms.document.read",
      team: "hrms.document.read_team",
      self: "hrms.document.read_self",
    });
    const scopeFilter = await employeeScopeFilter(ctx, scope);
    if (!scopeFilter.allow) return forbidden("No document read permission");
    const callerId = await getCallerEmployeeId(ctx);

    // Which documents the caller may see. Docs shared *with* the caller are
    // included alongside their own + company-wide docs (that's what makes the
    // Share feature work — previously shares were ignored by the list).
    const accessClauses: Prisma.DocumentWhereInput[] = [];
    if (companyOnly) {
      accessClauses.push({ employeeId: null });
    } else if (employeeId) {
      accessClauses.push({ employeeId });
    } else if (scopeFilter.employeeIds) {
      accessClauses.push({ employeeId: { in: scopeFilter.employeeIds } });
      accessClauses.push({ employeeId: null });
      if (callerId) accessClauses.push({ shares: { some: { sharedWith: callerId } } });
    }
    // else: unrestricted (broad hrms.document.read) → no access clause.

    // Combine access + search under AND so neither clobbers the other's OR
    // (previously a `search` OR silently overwrote the scope OR).
    const and: Prisma.DocumentWhereInput[] = [];
    if (accessClauses.length) and.push({ OR: accessClauses });
    if (sharedWithMe && callerId) and.push({ shares: { some: { sharedWith: callerId } } });
    if (search) {
      and.push({
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    const where: Prisma.DocumentWhereInput = {
      orgId,
      deletedAt: null,
      ...(category && { category: category as Prisma.EnumDocumentCategoryFilter["equals"] }),
      ...(status && { status: status as Prisma.EnumDocumentStatusFilter["equals"] }),
      ...(isTemplate !== null && isTemplate !== undefined && { isTemplate: isTemplate === "true" }),
      ...(tag && { tags: { array_contains: tag } as Prisma.JsonFilter }),
      ...(and.length ? { AND: and } : {}),
    };

    const [docs, total] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy: sort ? { [sort]: order } : { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { acknowledgments: true, shares: true } },
        },
      }),
      prisma.document.count({ where }),
    ]);

    return successResponse(docs, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /documents error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId, permissions }) => {
  try {
    const body = await req.json();

    // Self-only writers (hrms.document.write_self without hrms.document.write)
    // can ONLY create documents for themselves — never for another employee.
    const isSelfOnly =
      !permissions.includes("*") &&
      !permissions.includes("hrms.document.write") &&
      permissions.includes("hrms.document.write_self");

    if (Array.isArray(body?.documents)) {
      const parsed = bulkCreateDocumentSchema.safeParse(body);
      if (!parsed.success) {
        return validationError("Validation failed", parsed.error.flatten().fieldErrors);
      }

      // Force self-scoping when caller only has write_self.
      if (isSelfOnly && parsed.data.documents.some((d) => d.employeeId && d.employeeId !== userId)) {
        return validationError("You can only upload documents to your own vault.");
      }

      const rows = parsed.data.documents.map((d) => ({
        orgId,
        employeeId: isSelfOnly ? userId : (d.employeeId ?? null),
        title: d.title,
        description: d.description,
        category: d.category,
        fileUrl: d.fileUrl,
        fileType: d.fileType,
        fileSize: d.fileSize,
        isTemplate: d.isTemplate,
        status: d.status,
        expiryDate: d.expiryDate ? new Date(d.expiryDate) : null,
        uploadedBy: userId,
        tags: d.tags ?? undefined,
        metadata: d.metadata ? JSON.parse(JSON.stringify(d.metadata)) : undefined,
        parentDocumentId: d.parentDocumentId ?? null,
        createdBy: userId,
        updatedBy: userId,
      }));

      const result = await prisma.document.createMany({ data: rows });
      await createAuditLog({ orgId, userId, action: "Create", entityType: "Document", metadata: { count: result.count } });
      return successResponse({ inserted: result.count }, undefined, 201);
    }

    const parsed = createDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const d = parsed.data;
    // Same guard for the single-doc path.
    if (isSelfOnly && d.employeeId && d.employeeId !== userId) {
      return validationError("You can only upload documents to your own vault.");
    }
    const doc = await prisma.document.create({
      data: {
        orgId,
        employeeId: isSelfOnly ? userId : (d.employeeId ?? null),
        title: d.title,
        description: d.description,
        category: d.category,
        fileUrl: d.fileUrl,
        fileType: d.fileType,
        fileSize: d.fileSize,
        isTemplate: d.isTemplate,
        status: d.status,
        expiryDate: d.expiryDate ? new Date(d.expiryDate) : null,
        uploadedBy: userId,
        tags: d.tags ?? undefined,
        metadata: d.metadata ? JSON.parse(JSON.stringify(d.metadata)) : undefined,
        parentDocumentId: d.parentDocumentId ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Create", entityType: "Document", entityId: doc.id });

    void fireWorkflow({
      orgId,
      event: "document.uploaded",
      payload: {
        documentId: doc.id,
        employeeId: doc.employeeId,
        type: doc.category,
        title: doc.title,
      },
    });

    void extractDocumentText(doc.id, orgId);

    return successResponse(doc, undefined, 201);
  } catch (error) {
    console.error("POST /documents error:", error);
    return internalError();
  }
}, {
  // Accept either the broad write OR the self-only write. Handler above scopes
  // self-only callers to their own vault.
  requiredPermissions: ["hrms.document.write", "hrms.document.write_self"],
  anyPermission: true,
});
