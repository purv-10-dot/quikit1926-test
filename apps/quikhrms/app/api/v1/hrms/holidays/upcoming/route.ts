import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withServiceAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

/**
 * GET /api/v1/hrms/holidays/upcoming — dashboard widget feed.
 * Sources the single flat `CompanyHoliday` table.
 */
export const GET = withServiceAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 10);
    const monthStr = url.searchParams.get("month");
    const yearStr = url.searchParams.get("year");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yearEnd = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());

    const upcomingRows = await prisma.companyHoliday.findMany({
      where: { orgId, deletedAt: null, date: { gte: today, lte: yearEnd } },
      orderBy: { date: "asc" },
      take: 20,
      select: { id: true, name: true, date: true, type: true, isOptional: true },
    });
    // Safety-net dedupe: never surface the same holiday (name + day) twice, even
    // if duplicate rows slipped into the DB from older imports.
    const seenKey = new Set<string>();
    const upcoming = upcomingRows
      .filter((h) => {
        const k = `${h.name}|${new Date(h.date).toISOString().slice(0, 10)}`;
        if (seenKey.has(k)) return false;
        seenKey.add(k);
        return true;
      })
      .map((h) => ({
        id: h.id,
        name: h.name,
        date: h.date,
        type: String(h.type),
        isFloater: h.isOptional,
        calendar: null as { id: string; name: string } | null,
      }))
      .slice(0, 20);

    let monthHolidays: { id: string; name: string; date: Date; type: string }[] = [];
    if (monthStr && yearStr) {
      const m = Number(monthStr);
      const y = Number(yearStr);
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0, 23, 59, 59);
      const rows = await prisma.companyHoliday.findMany({
        where: { orgId, deletedAt: null, date: { gte: start, lte: end } },
        orderBy: { date: "asc" },
        select: { id: true, name: true, date: true, type: true },
      });
      monthHolidays = rows.map((h) => ({ id: h.id, name: h.name, date: h.date, type: String(h.type) }));
    }

    return successResponse({ upcoming: upcoming.slice(0, limit), monthHolidays });
  } catch (e) {
    console.error("GET /holidays/upcoming error:", e);
    return internalError();
  }
});
