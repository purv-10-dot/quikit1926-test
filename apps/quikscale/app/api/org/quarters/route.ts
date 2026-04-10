import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";

async function getMembership(userId: string) {
  return db.membership.findFirst({
    where: { userId, status: "active" },
    orderBy: { createdAt: "asc" },
    include: { tenant: { select: { id: true, fiscalYearStart: true } } },
  });
}

/* ─── Day-Count Quarter Generation ──────────────────────────────────────────── */

/** Check if a date range contains Feb 29 (leap day). */
function fyContainsLeapDay(fyStart: Date, fyEnd: Date): boolean {
  const startYear = fyStart.getUTCFullYear();
  const endYear = fyEnd.getUTCFullYear();
  for (let y = startYear; y <= endYear; y++) {
    // Check if Feb 29 exists in year y and falls within the FY range
    if (isLeapYear(y)) {
      const feb29 = new Date(Date.UTC(y, 1, 29)); // Feb 29
      if (feb29 >= fyStart && feb29 <= fyEnd) return true;
    }
  }
  return false;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (86400000));
}

/**
 * Generate all 4 quarters for a fiscal year using day-count splitting.
 * Q1 = 91 days, Q2 = 91 days, Q3 = 91 days, Q4 = 92 days (or 93 if leap).
 *
 * @param fyStartDate - The exact FY start date. If not provided, defaults to
 *                      day 1 of fiscalStartMonth in the given fiscalYear.
 */
function generateQuarterDates(
  fiscalYear: number,
  fiscalStartMonth: number, // 1-12 (1=Jan, 4=Apr)
  fyStartDate?: Date,
): { quarter: string; startDate: Date; endDate: Date }[] {
  // FY start = provided date OR 1st day of fiscal start month
  const fyStart = fyStartDate
    ? new Date(Date.UTC(fyStartDate.getUTCFullYear(), fyStartDate.getUTCMonth(), fyStartDate.getUTCDate()))
    : new Date(Date.UTC(fiscalYear, fiscalStartMonth - 1, 1));

  // FY end = start date + 1 year - 1 day
  const fyEnd = addDays(
    new Date(Date.UTC(fyStart.getUTCFullYear() + 1, fyStart.getUTCMonth(), fyStart.getUTCDate())),
    -1
  );

  const totalDays = diffDays(fyStart, fyEnd) + 1; // 365 or 366
  const hasLeap = totalDays === 366;

  // Day distribution: Q1=91, Q2=91, Q3=91, Q4=92 (or 93 if leap)
  const dayDistribution = [91, 91, 91, hasLeap ? 93 : 92];
  const quarterNames = ["Q1", "Q2", "Q3", "Q4"];

  const quarters: { quarter: string; startDate: Date; endDate: Date }[] = [];
  let cursor = new Date(fyStart.getTime());

  for (let i = 0; i < 4; i++) {
    const qStart = new Date(cursor.getTime());
    const qEnd = addDays(qStart, dayDistribution[i] - 1);
    quarters.push({
      quarter: quarterNames[i],
      startDate: qStart,
      endDate: qEnd,
    });
    cursor = addDays(qEnd, 1); // next quarter starts the day after
  }

  return quarters;
}

/* ─── Serialization ─────────────────────────────────────────────────────────── */

function serializeRow(
  q: { id: string; fiscalYear: number; quarter: string; startDate: Date; endDate: Date; createdAt: Date; updatedAt: Date; createdBy: string },
  userMap: Record<string, { firstName: string; lastName: string }>,
) {
  const u    = userMap[q.createdBy];
  const name = u ? `${u.firstName} ${u.lastName}` : "—";
  const ini  = u ? `${u.firstName[0] ?? ""}${u.lastName[0] ?? ""}`.toUpperCase() : "??";
  return {
    id:          q.id,
    fiscalYear:  q.fiscalYear,
    quarter:     q.quarter,
    startDate:   q.startDate.toISOString(),
    endDate:     q.endDate.toISOString(),
    createdAt:   q.createdAt.toISOString(),
    updatedAt:   q.updatedAt.toISOString(),
    createdBy:   q.createdBy,
    createdByName: name,
    createdByInitials: ini,
  };
}

/* ─── GET /api/org/quarters?year=2026 ───────────────────────────────────────── */

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const membership = await getMembership(session.user.id);
    if (!membership)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const tenantId = membership.tenantId;
    const yearParam = request.nextUrl.searchParams.get("year");

    // Get all available fiscal years
    const allYearsRaw = await db.quarterSetting.findMany({
      where:    { tenantId },
      select:   { fiscalYear: true },
      distinct: ["fiscalYear"],
      orderBy:  { fiscalYear: "desc" },
    });
    const availableYears = allYearsRaw.map(r => r.fiscalYear);

    // ── Future FY Visibility Check ──
    let futureYearAvailable: number | null = null;

    const futureFlags = await db.featureFlag.findMany({
      where: { tenantId, key: { in: ["enable_future_quarters", "future_days_limit"] } },
      select: { key: true, enabled: true, value: true },
    });
    const futureEnabled = futureFlags.find(f => f.key === "enable_future_quarters")?.enabled ?? false;
    const futureDaysLimit = parseInt(futureFlags.find(f => f.key === "future_days_limit")?.value || "0", 10);

    if (futureEnabled && futureDaysLimit > 0) {
      // Find the current quarter
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const currentQuarter = await db.quarterSetting.findFirst({
        where: {
          tenantId,
          startDate: { lte: today },
          endDate: { gte: today },
        },
      });

      if (currentQuarter) {
        const daysUntilEnd = diffDays(today, currentQuarter.endDate);
        if (daysUntilEnd <= futureDaysLimit) {
          const nextFY = currentQuarter.fiscalYear + 1;
          if (!availableYears.includes(nextFY)) {
            futureYearAvailable = nextFY;
            availableYears.unshift(nextFY); // add to front (most recent first)
          }
        }
      }
    }

    // Fetch quarters (filtered by year if provided)
    const where: Record<string, unknown> = { tenantId };
    if (yearParam) where.fiscalYear = parseInt(yearParam, 10);

    const rows = await db.quarterSetting.findMany({
      where,
      orderBy: [{ fiscalYear: "asc" }, { quarter: "asc" }],
    });

    // Resolve createdBy users
    const userIds = [...new Set(rows.map(r => r.createdBy))];
    const users   = await db.user.findMany({
      where:  { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    return NextResponse.json({
      success:        true,
      data:           rows.map(r => serializeRow(r, userMap)),
      availableYears: availableYears.sort((a, b) => b - a),
      futureYearAvailable,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch quarters";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/* ─── POST /api/org/quarters ────────────────────────────────────────────────── */

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const membership = await getMembership(session.user.id);
    if (!membership)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const { tenantId } = membership;
    const fiscalStartMonth = membership.tenant.fiscalYearStart ?? 4;

    const body = await request.json();
    const { fiscalYear, startDate: startDateStr } = body;
    if (!fiscalYear || typeof fiscalYear !== "number")
      return NextResponse.json({ success: false, error: "fiscalYear is required" }, { status: 400 });

    // Parse optional start date
    const fyStartDate = startDateStr ? new Date(startDateStr) : undefined;
    if (fyStartDate && isNaN(fyStartDate.getTime()))
      return NextResponse.json({ success: false, error: "Invalid start date" }, { status: 400 });

    // ── Block future FY creation if feature flag is disabled ──
    const currentMonth = new Date().getMonth(); // 0-indexed
    const currentFY = currentMonth >= (fiscalStartMonth - 1)
      ? new Date().getFullYear()
      : new Date().getFullYear() - 1;

    if (fiscalYear > currentFY) {
      const futureFlags = await db.featureFlag.findMany({
        where: { tenantId, key: { in: ["enable_future_quarters", "future_days_limit"] } },
        select: { key: true, enabled: true, value: true },
      });
      const futureEnabled = futureFlags.find(f => f.key === "enable_future_quarters")?.enabled ?? false;

      if (!futureEnabled) {
        return NextResponse.json(
          { success: false, error: "Future quarters are disabled. Enable them in Settings > Configurations." },
          { status: 403 }
        );
      }

      // Also check the N-days-before-quarter-end condition
      const futureDaysLimit = parseInt(futureFlags.find(f => f.key === "future_days_limit")?.value || "0", 10);
      if (futureDaysLimit > 0) {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const currentQuarter = await db.quarterSetting.findFirst({
          where: { tenantId, startDate: { lte: today }, endDate: { gte: today } },
        });
        if (currentQuarter) {
          const daysUntilEnd = diffDays(today, currentQuarter.endDate);
          if (daysUntilEnd > futureDaysLimit) {
            return NextResponse.json(
              { success: false, error: `Future quarters can only be created within ${futureDaysLimit} days of the current quarter ending (${daysUntilEnd} days remaining).` },
              { status: 403 }
            );
          }
        }
      }
    }

    // Check if quarters already exist for this FY
    const existing = await db.quarterSetting.findMany({
      where: { tenantId, fiscalYear },
    });
    if (existing.length > 0)
      return NextResponse.json(
        { success: false, error: `Quarters for FY ${fiscalYear}-${String(fiscalYear + 1).slice(-2)} already exist` },
        { status: 409 }
      );

    // Generate using day-count logic
    const quarterDates = generateQuarterDates(fiscalYear, fiscalStartMonth, fyStartDate);

    const created = await Promise.all(
      quarterDates.map(q =>
        db.quarterSetting.create({
          data: {
            tenantId,
            fiscalYear,
            quarter:   q.quarter,
            startDate: q.startDate,
            endDate:   q.endDate,
            createdBy: session.user!.id,
          },
        })
      )
    );

    const userMap = {
      [session.user.id]: {
        firstName: session.user.name?.split(" ")[0] ?? "",
        lastName: session.user.name?.split(" ").slice(1).join(" ") ?? "",
      },
    };

    return NextResponse.json({
      success: true,
      data: created.map(r => serializeRow(r, userMap)),
    }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to generate quarters";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
