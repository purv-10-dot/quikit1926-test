import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { getCached, cacheKeys } from "@/lib/services/cache";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { getTodayAvailability, canSeeSensitiveAvailability } from "@/lib/services/availability";

/**
 * GET /api/v1/hrms/dashboard/batch
 *
 * The single optimized initial-load call for the home dashboard. One request,
 * all queries run in parallel server-side — replaces the 8 separate fetches the
 * widgets used to fire (birthdays/holidays were each fetched twice).
 *
 * Returns only the MINIMUM the above-the-fold UI needs:
 *  - celebration lists trimmed to this month (cap 5) + precomputed counts,
 *  - today's availability, current-month holidays + the next upcoming,
 *  - open-requisition total + the first 6 cards.
 * "View All" / month navigation pull the full lists on demand from the
 * per-resource detail routes.
 *
 * Redis is used ONLY for the auth/session hot-path (employee profile + unread
 * notification count, via @quikit/auth/cache) — matching the other apps.
 * Celebration/dashboard data is read straight from Postgres, never cached.
 */

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    const { orgId, userId } = ctx;
    const canSeeSensitive = canSeeSensitiveAvailability(ctx.permissions);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
    const yearEnd = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());

    const [
      me,
      unreadCount,
      celebrationEmployees,
      holidayRows,
      monthHolidayRows,
      availability,
      openReqs,
      attendance,
    ] = await Promise.all([
      // 1. Employee profile — cached 5min (auth/profile hot-path).
      getCached(cacheKeys.employeeMe(orgId, userId), 300, async () => {
        const employeeId = await resolveEmployeeId(orgId, userId);
        if (!employeeId) return null;
        return prisma.employee.findFirst({
          where: { id: employeeId, orgId, deletedAt: null },
          select: {
            id: true, employeeCode: true, firstName: true, lastName: true,
            displayName: true, jobTitle: true, profilePhoto: true, status: true,
            designation: { select: { id: true, title: true } },
          },
        });
      }),

      // 2. Unread notification count — cached 15s (auth/profile hot-path).
      getCached(cacheKeys.notifUnread(orgId, userId), 15, () =>
        prisma.hrmsNotification.count({ where: { orgId, employeeId: userId, isRead: false } }),
      ),

      // 3. Active employees with celebration dates — direct read (no Redis).
      //    Birthdays + anniversaries are derived from this single scan.
      prisma.employee.findMany({
        where: { orgId, deletedAt: null, status: "Active" },
        take: 5000,
        select: {
          id: true, firstName: true, lastName: true, profilePhoto: true,
          jobTitle: true, dateOfBirth: true, dateOfJoining: true,
        },
      }),

      // 4. Upcoming holidays (next-year window) — direct read.
      prisma.companyHoliday.findMany({
        where: { orgId, deletedAt: null, date: { gte: today, lte: yearEnd } },
        orderBy: { date: "asc" },
        take: 8,
        select: { id: true, name: true, date: true, type: true, isOptional: true },
      }),

      // 5. Current-month holidays — calendar dots.
      prisma.companyHoliday.findMany({
        where: { orgId, deletedAt: null, date: { gte: monthStart, lte: monthEnd } },
        orderBy: { date: "asc" },
        select: { id: true, name: true, date: true, type: true },
      }),

      // 6+7. Today's availability (approved leave + WFH). Sick/Parental identities
      //      are anonymized for non-HR callers by the shared service.
      getTodayAvailability(orgId, canSeeSensitive),

      // 8. Open requisitions — open-positions total + first cards.
      prisma.jobRequisition.findMany({
        where: { orgId, deletedAt: null, status: { in: ["ReqOpen", "ReqApproved"] } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, title: true, requisitionNumber: true,
          positions: true, filledPositions: true,
          employmentType: true, workLocation: true,
          department: { select: { name: true } },
        },
      }),

      // 9. Attendance today — real-time, never cached.
      (async () => {
        const employeeId = (await resolveEmployeeId(orgId, userId)) ?? userId;
        const record = await prisma.attendanceRecord.findFirst({
          where: { orgId, employeeId, date: today, deletedAt: null },
        });
        type Punch = { in: string; out: string | null };
        const punches: Punch[] = Array.isArray(record?.punches) ? (record!.punches as Punch[]) : [];
        const checkedIn = punches.some((p) => !p.out);
        const now = Date.now();
        const elapsedSeconds = punches.reduce((sum, p) => {
          const start = new Date(p.in).getTime();
          const end = p.out ? new Date(p.out).getTime() : now;
          return sum + Math.max(0, Math.floor((end - start) / 1000));
        }, 0);
        return { checkedIn, elapsedSeconds };
      })(),
    ]);

    // ── Birthdays: this calendar month, nearest first, top 5 + counts ──
    const birthdayDerived = celebrationEmployees
      .map((e) => {
        if (!e.dateOfBirth) return null;
        const dob = new Date(e.dateOfBirth);
        const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        if (next < today) next.setFullYear(today.getFullYear() + 1);
        const daysUntil = Math.floor((next.getTime() - today.getTime()) / 86_400_000);
        const inCurrentMonth =
          next.getMonth() === today.getMonth() && next.getFullYear() === today.getFullYear();
        return {
          id: e.id, firstName: e.firstName, lastName: e.lastName,
          profilePhoto: e.profilePhoto, daysUntil, inCurrentMonth,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null && e.inCurrentMonth)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    const birthdays = birthdayDerived.map(({ inCurrentMonth: _drop, ...b }) => b);
    const birthdayCounts = {
      today: birthdayDerived.filter((b) => b.daysUntil === 0).length,
      month: birthdayDerived.filter((b) => b.daysUntil > 0 && b.daysUntil <= 30).length,
    };

    // ── Anniversaries: this calendar month, nearest first, top 5 ──
    const anniversaries = celebrationEmployees
      .map((e) => {
        const doj = new Date(e.dateOfJoining);
        const next = new Date(today.getFullYear(), doj.getMonth(), doj.getDate());
        if (next < today) next.setFullYear(today.getFullYear() + 1);
        const daysUntil = Math.floor((next.getTime() - today.getTime()) / 86_400_000);
        const years = next.getFullYear() - doj.getFullYear();
        const inCurrentMonth =
          next.getMonth() === today.getMonth() && next.getFullYear() === today.getFullYear();
        return {
          id: e.id, firstName: e.firstName, lastName: e.lastName,
          profilePhoto: e.profilePhoto, jobTitle: e.jobTitle, daysUntil, years, inCurrentMonth,
        };
      })
      .filter((e) => e.years > 0 && e.inCurrentMonth)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 5)
      .map(({ inCurrentMonth: _drop, ...a }) => a);

    // ── Holidays: next upcoming (cards) + current-month dots + today count ──
    const upcoming = holidayRows.map((h) => ({
      id: h.id, name: h.name, date: h.date, type: String(h.type),
      isFloater: h.isOptional, calendar: null as { id: string; name: string } | null,
    }));
    const monthHolidays = monthHolidayRows.map((h) => ({ id: h.id, name: h.name, date: h.date, type: String(h.type) }));
    const todayKey = today.toDateString();
    const eventsToday = upcoming.filter((h) => new Date(h.date).toDateString() === todayKey).length;

    // ── Job openings: total open positions + first 6 cards ──
    const totalOpen = openReqs.reduce((s, o) => s + Math.max(0, o.positions - o.filledPositions), 0);
    const jobOpenings = { totalOpen, items: openReqs.slice(0, 6) };

    return successResponse({
      me,
      unreadCount,
      attendance,
      birthdays,
      birthdayCounts,
      anniversaries,
      holidays: { upcoming, monthHolidays },
      eventsToday,
      availability,
      jobOpenings,
    });
  } catch (error) {
    console.error("GET /dashboard/batch error:", error);
    return internalError();
  }
}, {
  // Fires on every home-page load and fans out to several scans — throttle per user.
  rateLimit: { max: 30, windowSec: 60, by: "user" },
});
