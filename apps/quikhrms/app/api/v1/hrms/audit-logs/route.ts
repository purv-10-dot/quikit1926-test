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

    // Enrich each row with a human-readable actor name. Audit `userId` maps to
    // an Employee.id in this app; fall back to the raw id when unresolved.
    const userIds = [...new Set(logs.map((l) => l.userId).filter(Boolean))];
    const employees = userIds.length
      ? await prisma.employee.findMany({
          where: { orgId, id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        })
      : [];
    const actorMap = new Map(
      employees.map((e) => [
        e.id,
        `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() || e.employeeCode || e.id,
      ]),
    );

    const enriched = logs.map((l) => ({
      ...l,
      actorName: actorMap.get(l.userId) ?? l.userId,
    }));

    return successResponse(enriched, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /audit-logs error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.audit.read"] });
