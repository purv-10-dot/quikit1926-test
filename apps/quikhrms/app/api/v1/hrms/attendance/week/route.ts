import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, forbidden, internalError } from "@/lib/api-response";
import { getWeekSummary } from "@/lib/services/attendance";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { getCallerReporteeIds } from "@/lib/rbac/scope";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, userId, permissions } = ctx;
    const { searchParams } = new URL(req.url);
    let employeeId = searchParams.get("employeeId") ?? userId;
    if (employeeId === "me" || employeeId === userId) {
      employeeId = (await resolveEmployeeId(orgId, userId)) ?? employeeId;
    }

    // Scope gate: viewing someone else's week needs full read, or they must be
    // your direct reportee. Blocks ?employeeId=<other> IDOR.
    const ownEmpId = await resolveEmployeeId(orgId, userId);
    if (employeeId !== ownEmpId) {
      const canAll = permissions.includes("*") || permissions.includes("hrms.attendance.read");
      if (!canAll) {
        const reportees = await getCallerReporteeIds(ctx);
        if (!reportees.includes(employeeId)) return forbidden("You cannot view this employee's attendance.");
      }
    }

    const weekStartParam = searchParams.get("weekStart");

    let weekStart: Date;
    if (weekStartParam) {
      weekStart = new Date(weekStartParam);
    } else {
      const today = new Date();
      const day = today.getDay();
      weekStart = new Date(today);
      weekStart.setDate(today.getDate() - day);
    }
    weekStart.setHours(0, 0, 0, 0);

    const summary = await getWeekSummary(orgId, employeeId, weekStart);
    return successResponse(summary);
  } catch (error) {
    console.error("GET /attendance/week error:", error);
    return internalError();
  }
});
