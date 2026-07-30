import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, forbidden, internalError } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { resolveScope, employeeScopeFilter, getCallerEmployeeId } from "@/lib/rbac/scope";
import type { Prisma } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId } = ctx;
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") ?? "30", 10) || 30));
    const employeeId = searchParams.get("employeeId");
    const companyOnly = searchParams.get("companyOnly") === "true";

    // Gated + scoped: previously this listed EVERY expiring doc in the org with
    // no permission, no scope, no pagination and a raw fileUrl dump.
    const scope = resolveScope(ctx, {
      all: "hrms.document.read",
      team: "hrms.document.read_team",
      self: "hrms.document.read_self",
    });
    const sf = await employeeScopeFilter(ctx, scope);
    if (!sf.allow) return forbidden("No document read permission");
    const callerId = await getCallerEmployeeId(ctx);

    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);

    const accessClauses: Prisma.DocumentWhereInput[] = [];
    if (companyOnly) {
      accessClauses.push({ employeeId: null });
    } else if (employeeId) {
      if (sf.employeeIds && !sf.employeeIds.includes(employeeId)) {
        return forbidden("You don't have access to this employee's documents");
      }
      accessClauses.push({ employeeId });
    } else if (sf.employeeIds) {
      accessClauses.push({ employeeId: { in: sf.employeeIds } });
      accessClauses.push({ employeeId: null });
      if (callerId) accessClauses.push({ shares: { some: { sharedWith: callerId } } });
    }

    const where: Prisma.DocumentWhereInput = {
      orgId,
      deletedAt: null,
      expiryDate: { gte: now, lte: cutoff },
      status: { in: ["Active", "Draft"] },
      ...(accessClauses.length ? { OR: accessClauses } : {}),
    };

    const [docs, total] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy: { expiryDate: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, title: true, category: true, status: true,
          employeeId: true, expiryDate: true, fileType: true,
        },
      }),
      prisma.document.count({ where }),
    ]);

    const withDays = docs.map((d) => ({
      ...d,
      daysUntilExpiry: d.expiryDate ? Math.ceil((d.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null,
    }));

    return successResponse(withDays, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /documents/expiring error:", error);
    return internalError();
  }
});
