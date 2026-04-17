import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { toErrorMessage } from "@/lib/api/errors";
import { generateQuartersSchema } from "@/lib/schemas/quarterSchema";
import { diffDays, generateQuarterDates } from "@/lib/utils/quarterGen";
import { gateModuleApi } from "@quikit/auth/feature-gate";

async function getMembership(userId: string) {
  return db.membership.findFirst({
    where: { userId, status: "active" },
    orderBy: { createdAt: "asc" },
    include: { tenant: { select: { id: true, fiscalYearStart: true } } },
  });
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
    const blocked = await gateModuleApi("quikscale", "orgSetup.quarters", tenantId);
    if (blocked) return blocked;

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
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to fetch quarters") }, { status: 500 });
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
    const blocked = await gateModuleApi("quikscale", "orgSetup.quarters", tenantId);
    if (blocked) return blocked;

    const fiscalStartMonth = membership.tenant.fiscalYearStart ?? 4;

    const parsed = generateQuartersSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    const { fiscalYear, startDate: startDateStr } = parsed.data;

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
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to generate quarters") }, { status: 500 });
  }
}
