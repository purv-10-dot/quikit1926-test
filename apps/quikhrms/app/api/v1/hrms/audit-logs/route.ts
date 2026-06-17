import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import type { Prisma } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const actorId = searchParams.get("actorId");
    const entityType = searchParams.get("entityType");
    const action = searchParams.get("action");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Prisma.AuditLogWhereInput = {
      orgId,
      ...(actorId && { userId: actorId }),
      ...(entityType && { entityType }),
      ...(action && { action: action as Prisma.EnumAuditActionFilter["equals"] }),
      ...(from || to ? {
        createdAt: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        },
      } : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.hrmsAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          userId: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
      prisma.hrmsAuditLog.count({ where }),
    ]);

    return successResponse(logs, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /audit-logs error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.audit.read"] });
