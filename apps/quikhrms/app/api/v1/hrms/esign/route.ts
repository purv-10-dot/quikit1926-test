import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createESignRequestSchema } from "@/lib/validations/gap-fill";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const status = searchParams.get("status");
    const documentId = searchParams.get("documentId");

    const where = {
      orgId, deletedAt: null,
      ...(status && { status: status as "ESignDraft" }),
      ...(documentId && { documentId }),
    };

    const [items, total] = await Promise.all([
      prisma.eSignRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.eSignRequest.count({ where }),
    ]);

    return successResponse(items, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /esign error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createESignRequestSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const d = parsed.data;
    const request = await prisma.eSignRequest.create({
      data: {
        orgId,
        documentId: d.documentId ?? null,
        title: d.title,
        provider: d.provider,
        signers: JSON.parse(JSON.stringify(d.signers.map((s) => ({ ...s, status: "Pending" })))),
        message: d.message,
        status: "ESignDraft",
        expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
        createdBy: userId, updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Create", entityType: "ESignRequest", entityId: request.id });
    return successResponse(request, undefined, 201);
  } catch (error) {
    console.error("POST /esign error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.document.write"] });
