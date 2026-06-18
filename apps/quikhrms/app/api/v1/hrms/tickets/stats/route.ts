import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

export const GET = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") ?? "all";

    const baseWhere = {
      orgId,
      deletedAt: null,
      ...(scope === "mine" && { raisedById: userId }),
      ...(scope === "assigned" && { assignedToId: userId }),
    };

    const now = new Date();

    const [
      total,
      open,
      inProgress,
      onHold,
      resolved,
      closed,
      reopened,
      urgent,
      overdueResolve,
      slaBreached,
      escalated,
      byDepartment,
      byPriority,
    ] = await Promise.all([
      prisma.ticket.count({ where: baseWhere }),
      prisma.ticket.count({ where: { ...baseWhere, status: "Open" } }),
      prisma.ticket.count({ where: { ...baseWhere, status: "InProgress" } }),
      prisma.ticket.count({ where: { ...baseWhere, status: "OnHold" } }),
      prisma.ticket.count({ where: { ...baseWhere, status: "Resolved" } }),
      prisma.ticket.count({ where: { ...baseWhere, status: "Closed" } }),
      prisma.ticket.count({ where: { ...baseWhere, status: "Reopened" } }),
      prisma.ticket.count({ where: { ...baseWhere, priority: "Urgent" } }),
      prisma.ticket.count({
        where: {
          ...baseWhere,
          slaResolveDueAt: { lt: now },
          status: { notIn: ["Resolved", "Closed", "Cancelled"] },
        },
      }),
      prisma.ticket.count({
        where: {
          ...baseWhere,
          resolveBreachedAt: { not: null },
          status: { notIn: ["Resolved", "Closed", "Cancelled"] },
        },
      }),
      prisma.ticket.count({
        where: {
          ...baseWhere,
          escalationLevel: { gte: 2 },
          status: { notIn: ["Resolved", "Closed", "Cancelled"] },
        },
      }),
      prisma.ticket.groupBy({
        by: ["departmentId"],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.ticket.groupBy({
        by: ["priority"],
        where: baseWhere,
        _count: { _all: true },
      }),
    ]);

    const departmentIds = byDepartment
      .map((d) => d.departmentId)
      .filter((id): id is string => !!id);
    const departments = await prisma.department.findMany({
      where: { id: { in: departmentIds } },
      select: { id: true, name: true, code: true },
    });
    const deptMap = new Map(departments.map((d) => [d.id, d]));

    return successResponse({
      counts: {
        total,
        open,
        inProgress,
        onHold,
        resolved,
        closed,
        reopened,
        urgent,
        overdueResolve,
        slaBreached,
        escalated,
      },
      byDepartment: byDepartment.map((d) => ({
        department: d.departmentId ? deptMap.get(d.departmentId) ?? { id: d.departmentId } : null,
        count: d._count._all,
      })),
      byPriority: byPriority.map((p) => ({
        priority: p.priority,
        count: p._count._all,
      })),
    });
  } catch (error) {
    console.error("GET /tickets/stats error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.ticket.read", "hrms.ticket.read_self", "hrms.ticket.read_assigned"],
  anyPermission: true,
});
