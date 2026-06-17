import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { getWeekSummary } from "@/lib/services/attendance";
import { resolveEmployeeId } from "@/lib/resolve-employee";

export const GET = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const { searchParams } = new URL(req.url);
    let employeeId = searchParams.get("employeeId") ?? userId;
    if (employeeId === "me" || employeeId === userId) {
      employeeId = (await resolveEmployeeId(orgId, userId)) ?? employeeId;
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
