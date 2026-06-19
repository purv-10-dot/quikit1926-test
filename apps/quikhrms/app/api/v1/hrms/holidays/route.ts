import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";

/**
 * GET /api/v1/hrms/holidays — read-only holiday list for the employee-facing
 * Holiday Calendar view. Sources the single flat `CompanyHoliday` table.
 * Authoring (create/edit/delete) lives in Settings → Holiday Calendar
 * (/api/v1/hrms/settings/holidays).
 */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const year = searchParams.get("year");

    const where = {
      orgId,
      deletedAt: null,
      ...(year ? { year: parseInt(year, 10) } : {}),
    };

    const [holidays, total] = await Promise.all([
      prisma.companyHoliday.findMany({
        where,
        orderBy: { date: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.companyHoliday.count({ where }),
    ]);

    // `isFloater` is kept as an alias of `isOptional` so existing view code that
    // reads either keeps working after the calendar/Holiday merge.
    const shaped = holidays.map((h) => ({
      id: h.id,
      name: h.name,
      date: h.date,
      type: String(h.type),
      isOptional: h.isOptional,
      isFloater: h.isOptional,
      description: h.description,
    }));

    return successResponse(shaped, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /holidays error:", error);
    return internalError();
  }
});
