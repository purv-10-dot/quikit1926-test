import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";

/**
 * GET /api/v1/hrms/employees/me/subordinates
 * Returns the current employee's id + a flat list of all-level-down subordinate ids
 * (direct + indirect reports). Used to exclude downline from selectors like Delegations.
 */
export const GET = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) {
      return successResponse({ employeeId: null, subordinateIds: [] as string[] });
    }

    // Pull the whole org tree once and BFS down from the current employee.
    const all = await prisma.employee.findMany({
      where: { orgId, deletedAt: null },
      select: { id: true, reportingManagerId: true },
    });

    const childrenByMgr = new Map<string, string[]>();
    for (const e of all) {
      if (!e.reportingManagerId) continue;
      const arr = childrenByMgr.get(e.reportingManagerId) ?? [];
      arr.push(e.id);
      childrenByMgr.set(e.reportingManagerId, arr);
    }

    const subordinateIds: string[] = [];
    const queue = [...(childrenByMgr.get(employeeId) ?? [])];
    const seen = new Set<string>();
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      subordinateIds.push(id);
      const next = childrenByMgr.get(id);
      if (next) queue.push(...next);
    }

    return successResponse({ employeeId, subordinateIds });
  } catch (e) {
    console.error("GET /employees/me/subordinates error:", e);
    return internalError();
  }
});
