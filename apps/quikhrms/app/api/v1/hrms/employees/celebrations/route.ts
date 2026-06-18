import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

/**
 * GET /api/v1/hrms/employees/celebrations
 * All active employees' birthdays + work anniversaries, for the calendar view.
 * Org-visible (same as the dashboard birthday/anniversary widgets).
 *
 * No Redis — this is dashboard "View All" display data read straight from
 * Postgres (Redis is reserved for the auth/session hot-path). It's fetched
 * on demand only when the user opens the full celebrations page.
 */
export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { orgId, deletedAt: null, status: "Active" },
      select: {
        id: true, firstName: true, lastName: true, profilePhoto: true, jobTitle: true,
        dateOfBirth: true, dateOfJoining: true,
      },
      orderBy: { firstName: "asc" },
    });
    const items = employees.map((e) => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`.trim(),
      profilePhoto: e.profilePhoto,
      jobTitle: e.jobTitle,
      dateOfBirth: e.dateOfBirth ? e.dateOfBirth.toISOString() : null,
      dateOfJoining: e.dateOfJoining ? e.dateOfJoining.toISOString() : null,
    }));
    return successResponse(items);
  } catch (e) {
    console.error("GET /employees/celebrations error:", e);
    return internalError();
  }
});
