import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 5);

    // No Redis — birthdays are dashboard display data read straight from
    // Postgres (Redis is reserved for the auth/session hot-path). This route
    // backs the "View All" celebrations view; the dashboard widgets get a
    // pre-trimmed list from the single /dashboard/batch call instead.
    const employees = await prisma.employee.findMany({
      where: {
        orgId,
        deletedAt: null,
        status: "Active",
        dateOfBirth: { not: null },
      },
      select: {
        id: true, firstName: true, lastName: true, profilePhoto: true, dateOfBirth: true,
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const mapped = employees.map((e) => {
      if (!e.dateOfBirth) return null;
      const dob = new Date(e.dateOfBirth);
      const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
      if (next < today) next.setFullYear(today.getFullYear() + 1);
      const daysUntil = Math.floor((next.getTime() - today.getTime()) / 86_400_000);
      // Only surface birthdays still to come *this* calendar month — keeps the
      // widget showing relevant celebrations instead of ones months away.
      const inCurrentMonth =
        next.getMonth() === today.getMonth() && next.getFullYear() === today.getFullYear();
      return { ...e, daysUntil, inCurrentMonth };
    }).filter((e): e is NonNullable<typeof e> => e !== null && e.inCurrentMonth);

    mapped.sort((a, b) => a.daysUntil - b.daysUntil);

    return successResponse(mapped.slice(0, limit));
  } catch (e) {
    console.error("GET /employees/birthdays error:", e);
    return internalError();
  }
});
