import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 5);
    const windowDays = Number(url.searchParams.get("days") ?? 30);

    // No Redis — anniversaries are dashboard display data read straight from
    // Postgres (Redis is reserved for the auth/session hot-path). This route
    // backs the "View All" celebrations view; the dashboard widgets get a
    // pre-trimmed list from the single /dashboard/batch call instead.
    const employees = await prisma.employee.findMany({
      where: { orgId, deletedAt: null, status: "Active" },
      select: {
        id: true, firstName: true, lastName: true, profilePhoto: true,
        dateOfJoining: true, jobTitle: true,
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const items = employees.map((e) => {
      const doj = new Date(e.dateOfJoining);
      const next = new Date(today.getFullYear(), doj.getMonth(), doj.getDate());
      if (next < today) next.setFullYear(today.getFullYear() + 1);
      const daysUntil = Math.floor((next.getTime() - today.getTime()) / 86_400_000);
      const years = next.getFullYear() - doj.getFullYear();
      // Restrict to anniversaries falling in the current calendar month.
      const inCurrentMonth =
        next.getMonth() === today.getMonth() && next.getFullYear() === today.getFullYear();
      return { ...e, daysUntil, years, inCurrentMonth };
    })
      .filter((e) => e.years > 0 && e.inCurrentMonth)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    return successResponse(items.filter((e) => e.daysUntil <= windowDays).slice(0, limit));
  } catch (e) {
    console.error("GET /employees/anniversaries error:", e);
    return internalError();
  }
});
