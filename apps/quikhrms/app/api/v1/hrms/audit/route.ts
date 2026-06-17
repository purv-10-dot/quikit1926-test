import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const userId = searchParams.get("userId");
    const entityType = searchParams.get("entityType");
    const action = searchParams.get("action");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const dateRange = (dateFrom || dateTo)
      ? { createdAt: {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo) }),
        } }
      : {};

    const where = {
      orgId,
      ...(userId && { userId }),
      ...(entityType && { entityType }),
      ...(action && { action: action as "Create" | "Update" | "Delete" }),
      ...dateRange,
    };

    // Stats ignore the `action` filter so all KPI cards always show counts.
    const statsWhere = {
      orgId,
      ...(userId && { userId }),
      ...(entityType && { entityType }),
      ...dateRange,
    };

    const [logs, total, actionGroups] = await Promise.all([
      prisma.hrmsAuditLog.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
      }),
      prisma.hrmsAuditLog.count({ where }),
      prisma.hrmsAuditLog.groupBy({
        by: ["action"],
        where: statsWhere,
        _count: { _all: true },
      }),
    ]);

    const stats = {
      total: actionGroups.reduce((s, g) => s + g._count._all, 0),
      byAction: Object.fromEntries(actionGroups.map((g) => [g.action, g._count._all])) as Record<string, number>,
    };

    // Resolve actor userId → employee name. Most userIds are Employee.id;
    // dev/seed actors (e.g. "user_dev_001") map to the seeded admin via
    // employeeCode "QK-EMP-0001" — mirrors resolveEmployeeId(). "system"/
    // "migration" are non-human actors.
    const distinctUserIds = [...new Set(logs.map((l) => l.userId))];
    const employees = distinctUserIds.length
      ? await prisma.employee.findMany({
          where: {
            orgId,
            deletedAt: null,
            OR: [{ id: { in: distinctUserIds } }, { employeeCode: "QK-EMP-0001" }],
          },
          select: { id: true, employeeCode: true, firstName: true, lastName: true },
        })
      : [];
    const byId = new Map(employees.map((e) => [e.id, e]));
    const devFallback = employees.find((e) => e.employeeCode === "QK-EMP-0001") ?? null;

    const nameFor = (uid: string): string | null => {
      if (uid === "system" || uid === "migration") return "System";
      const direct = byId.get(uid);
      if (direct) return `${direct.firstName} ${direct.lastName}`.trim();
      // dev / seed actor fallback
      if (uid.startsWith("user_dev_") && devFallback) {
        return `${devFallback.firstName} ${devFallback.lastName}`.trim();
      }
      return null;
    };

    // ── Resolve the SUBJECT of each action — whose record it touched ──
    // The audit log is generic (entityType is a string), so we look up the
    // entityId in the right table to find the employee it belongs to.
    // entityId → employeeId per employee-linked entity type.
    const idsByType = new Map<string, string[]>();
    for (const l of logs) {
      if (!l.entityId) continue;
      const arr = idsByType.get(l.entityType) ?? [];
      arr.push(l.entityId);
      idsByType.set(l.entityType, arr);
    }
    // entityId → employeeId map, built from the source tables.
    const entityToEmployee = new Map<string, string>();
    const lookups: Promise<void>[] = [];
    const collect = async (
      type: string,
      finder: (ids: string[]) => Promise<{ id: string; employeeId: string }[]>,
    ) => {
      const ids = idsByType.get(type);
      if (!ids?.length) return;
      const rows = await finder([...new Set(ids)]);
      for (const r of rows) entityToEmployee.set(r.id, r.employeeId);
    };
    lookups.push(collect("InvestmentProof", (ids) =>
      prisma.investmentProof.findMany({ where: { orgId, id: { in: ids } }, select: { id: true, employeeId: true } })));
    lookups.push(collect("ReimbursementClaim", (ids) =>
      prisma.reimbursementClaim.findMany({ where: { orgId, id: { in: ids } }, select: { id: true, employeeId: true } })));
    lookups.push(collect("Form12BBDeclaration", (ids) =>
      prisma.form12BBDeclaration.findMany({ where: { orgId, id: { in: ids } }, select: { id: true, employeeId: true } })));
    lookups.push(collect("PriorPayrollRecord", (ids) =>
      prisma.priorPayrollRecord.findMany({ where: { orgId, id: { in: ids } }, select: { id: true, employeeId: true } })));
    lookups.push(collect("OneTimeEarning", (ids) =>
      prisma.oneTimeEarning.findMany({ where: { orgId, id: { in: ids } }, select: { id: true, employeeId: true } })));
    await Promise.all(lookups);

    // For Employee-type rows, entityId IS the employeeId.
    for (const l of logs) {
      if (l.entityType === "Employee" && l.entityId) entityToEmployee.set(l.entityId, l.entityId);
    }

    // Resolve all subject employeeIds → names in one query.
    const subjectEmpIds = [...new Set([...entityToEmployee.values()])];
    const subjectEmployees = subjectEmpIds.length
      ? await prisma.employee.findMany({
          where: { orgId, id: { in: subjectEmpIds } },
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        })
      : [];
    const subjectById = new Map(subjectEmployees.map((e) => [e.id, e]));

    const subjectFor = (entityType: string, entityId: string | null): string | null => {
      if (!entityId) return null;
      const empId = entityToEmployee.get(entityId);
      if (!empId) return null;
      const e = subjectById.get(empId);
      return e ? `${e.firstName} ${e.lastName}`.trim() : null;
    };

    const items = logs.map((l) => ({
      ...l,
      userName: nameFor(l.userId),
      subjectName: subjectFor(l.entityType, l.entityId),
    }));
    return successResponse({ items, stats }, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /audit error:", error); return internalError(); }
});
