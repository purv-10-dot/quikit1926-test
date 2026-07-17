import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createApprovalChainSchema } from "@/lib/validations/settings";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { createAuditLog } from "@/lib/utils/audit";
import type { Prisma } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const module = searchParams.get("module");
    const isActive = searchParams.get("isActive");

    const where: Prisma.ApprovalChainWhereInput = {
      orgId,
      deletedAt: null,
      ...(module && { module: module as Prisma.EnumApprovalModuleFilter["equals"] }),
      ...(isActive && { isActive: isActive === "true" }),
    };

    const [chains, total] = await Promise.all([
      prisma.approvalChain.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.approvalChain.count({ where }),
    ]);

    return successResponse(chains, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /settings/approval-chains error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createApprovalChainSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const { levels, autoApproveAfterDays, ...rest } = parsed.data;

    // Only one active chain per module. Creating an active chain deactivates any
    // other active chain for the same module.
    const chain = await prisma.$transaction(async (tx) => {
      const created = await tx.approvalChain.create({
        data: {
          orgId,
          ...rest,
          levels: JSON.parse(JSON.stringify(levels)),
          autoApproveAfterDays: autoApproveAfterDays ?? null,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      if (created.isActive) {
        await tx.approvalChain.updateMany({
          where: { orgId, module: created.module, isActive: true, deletedAt: null, id: { not: created.id } },
          data: { isActive: false, updatedBy: userId },
        });
      }
      return created;
    });

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "ApprovalChain", entityId: chain.id,
    });

    return successResponse(chain, undefined, 201);
  } catch (error) {
    console.error("POST /settings/approval-chains error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
