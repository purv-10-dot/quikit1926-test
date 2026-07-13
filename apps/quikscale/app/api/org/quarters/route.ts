import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { generateQuartersSchema } from "@/lib/schemas/quarterSchema";
import { addDays, generateQuarterDates, generateMonthlyQuarterDates, chainQuarterDates, isMonthBasedWeekCounts } from "@/lib/utils/quarterGen";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { fyHasData, fyLabel } from "@/lib/api/quartersFyHasData";
import { getCustomQuarterEnabled } from "@/lib/utils/featureFlags";

// Org resolution + auth + the orgSetup.quarters module gate now come from
// the shared wrapper (same as ../[id]/route.ts), so `orgId` is the org the
// user actually launched/selected (session.user.orgId, re-validated +
// app-scoped) — NOT "their oldest active membership". The previous local
// getMembership() picked first-active-by-createdAt, which leaked another
// org's quarters to multi-org users (e.g. an Org Admin in several orgs).
const withOrgAuth = withOrgAuthForModule("orgSetup.quarters");

/* ─── Serialization ─────────────────────────────────────────────────────────── */

function serializeRow(
  q: { id: string; fiscalYear: number; quarter: string; startDate: Date; endDate: Date; weekCount: number; createdAt: Date; updatedAt: Date; createdBy: string },
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
    weekCount:   q.weekCount,
    createdAt:   q.createdAt.toISOString(),
    updatedAt:   q.updatedAt.toISOString(),
    createdBy:   q.createdBy,
    createdByName: name,
    createdByInitials: ini,
  };
}

/* ─── GET /api/org/quarters?year=2026 ───────────────────────────────────────── */

export const GET = withOrgAuth(async ({ orgId }, request: NextRequest) => {
  const yearParam = request.nextUrl.searchParams.get("year");

  // Get all available fiscal years
  const allYearsRaw = await db.quarterSetting.findMany({
    where:    { orgId },
    select:   { fiscalYear: true },
    distinct: ["fiscalYear"],
    orderBy:  { fiscalYear: "desc" },
  });
  const availableYears = allYearsRaw.map(r => r.fiscalYear);

  // ── Future FY Visibility ──
  // Gate: `enable_future_quarters` toggles visibility on/off.
  // `future_days_limit` (FeatureFlag.value) controls HOW EARLY the next FY
  // appears — it only surfaces when today is within N days of the latest
  // quarter's end date. If unset or 0, the next FY is never shown (the flag
  // alone isn't enough). Overlap is prevented server-side by the contiguity
  // check in POST (startDate must be after the latest existing endDate).
  let futureYearAvailable: number | null = null;

  const [futureFlag, futureDaysFlag, latestEndRow] = await Promise.all([
    db.featureFlag.findFirst({
      where: { orgId, key: "enable_future_quarters" },
      select: { enabled: true },
    }),
    db.featureFlag.findFirst({
      where: { orgId, key: "future_days_limit" },
      select: { value: true },
    }),
    db.quarterSetting.findFirst({
      where: { orgId },
      orderBy: { endDate: "desc" },
      select: { endDate: true },
    }),
  ]);
  const futureEnabled = futureFlag?.enabled ?? false;
  const daysLimit     = parseInt(futureDaysFlag?.value ?? "0", 10) || 0;

  if (futureEnabled && daysLimit > 0 && latestEndRow) {
    const highestExistingFY = availableYears[0] ?? null;
    if (highestExistingFY !== null) {
      const nextFY = highestExistingFY + 1;
      if (!availableYears.includes(nextFY)) {
        // Only surface the next FY when today is within `daysLimit` days of
        // the latest quarter's end date (i.e. endDate - daysLimit <= today).
        const threshold = new Date(latestEndRow.endDate);
        threshold.setDate(threshold.getDate() - daysLimit);
        if (new Date() >= threshold) {
          futureYearAvailable = nextFY;
          availableYears.unshift(nextFY);
        }
      }
    }
  }

  // Fetch quarters (filtered by year if provided)
  const where: Record<string, unknown> = { orgId };
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

  // Determine which fiscal years are "locked" — i.e. have KPI, Priority, or
  // OPSP data. Quarters for locked years cannot be deleted or have their
  // start date changed to avoid orphaning existing records. The same
  // `fyHasData` helper is used by PUT/DELETE so policy stays in one place.
  const realYears = availableYears.filter(y => y !== futureYearAvailable);
  const dataChecks = await Promise.all(
    realYears.map(async (year) => ({ year, hasData: await fyHasData(orgId, year) }))
  );
  const hasDataByYear: Record<number, boolean> = Object.fromEntries(
    dataChecks.map(({ year, hasData }) => [year, hasData])
  );

  return NextResponse.json({
    success:        true,
    data:           rows.map(r => serializeRow(r, userMap)),
    availableYears: availableYears.sort((a, b) => b - a),
    futureYearAvailable,
    latestEndDate:  latestEndRow?.endDate.toISOString() ?? null,
    hasDataByYear,
  });
}, { fallbackErrorMessage: "Failed to fetch quarters" });

/* ─── POST /api/org/quarters ────────────────────────────────────────────────── */

export const POST = withOrgAuth(async ({ orgId, session }, request: NextRequest) => {
  const userId = session.user!.id;

  const org = await db.org.findUnique({
    where: { id: orgId },
    select: { fiscalYearStart: true },
  });
  const fiscalStartMonth = org?.fiscalYearStart ?? 4;

  const parsed = generateQuartersSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { fiscalYear, startDate: startDateStr, weekCounts, weeklyMeetingDay } = parsed.data;

  // Parse optional start date
  const fyStartDate = startDateStr ? new Date(startDateStr) : undefined;
  if (fyStartDate && isNaN(fyStartDate.getTime()))
    return NextResponse.json({ success: false, error: "Invalid start date" }, { status: 400 });

  // Custom Quarter Settings (flag on + a Q1 start date supplied) picks its
  // generator from the per-quarter week counts (see `isMonthBasedWeekCounts`):
  //  - all four = 13 (default) → month-based calendar quarters (365/366 days)
  //  - any quarter ≠ 13        → week-based chained quarters (weekCount × 7)
  // Otherwise we fall through to the legacy day-count split (weekCount = 13).
  const customEnabled = await getCustomQuarterEnabled(orgId);
  const useCustomQuarters = customEnabled && !!fyStartDate;

  // ── Future FY feature-flag gate ──
  // `enable_future_quarters` is the single on/off switch. No proximity /
  // days-limit check anymore — admins can create any future FY as long as
  // the start date doesn't overlap an existing quarter (validated below).
  const currentMonth = new Date().getMonth(); // 0-indexed
  const currentFY = currentMonth >= (fiscalStartMonth - 1)
    ? new Date().getFullYear()
    : new Date().getFullYear() - 1;

  if (fiscalYear > currentFY) {
    const futureFlag = await db.featureFlag.findFirst({
      where: { orgId, key: "enable_future_quarters" },
      select: { enabled: true },
    });
    if (!futureFlag?.enabled) {
      return NextResponse.json(
        { success: false, error: "Future quarters are disabled. Enable them in Settings > Configurations." },
        { status: 403 }
      );
    }
  }

  // Check if quarters already exist for this FY
  const existing = await db.quarterSetting.findMany({
    where: { orgId, fiscalYear },
  });
  if (existing.length > 0)
    return NextResponse.json(
      { success: false, error: `Quarters for FY ${fiscalYear}-${String(fiscalYear + 1).slice(-2)} already exist` },
      { status: 409 }
    );

  // ── Contiguity check ──
  // Start date must be strictly after the latest existing quarter's endDate
  // for this tenant. Prevents overlapping FYs (e.g. new FY start before the
  // previous FY's Q4 end).
  if (fyStartDate) {
    const latest = await db.quarterSetting.findFirst({
      where: { orgId },
      orderBy: { endDate: "desc" },
      select: { endDate: true, fiscalYear: true, quarter: true },
    });
    if (latest && fyStartDate.getTime() <= latest.endDate.getTime()) {
      const minAllowed = addDays(latest.endDate, 1);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      return NextResponse.json({
        success: false,
        error: `Start date must be after ${fmt(latest.endDate)} (FY ${latest.fiscalYear} ${latest.quarter} end). Earliest allowed: ${fmt(minAllowed)}.`,
      }, { status: 400 });
    }
  }

  // Generate dates: custom month-based (all-13) or week-based (any ≠ 13), else
  // the legacy day-count split.
  const quarterDates = useCustomQuarters
    ? (isMonthBasedWeekCounts(weekCounts)
        ? generateMonthlyQuarterDates(fyStartDate!)
        : chainQuarterDates(fyStartDate!, weekCounts!))
    : generateQuarterDates(fiscalYear, fiscalStartMonth, fyStartDate);

  const created = await Promise.all(
    quarterDates.map(q =>
      db.quarterSetting.create({
        data: {
          orgId,
          fiscalYear,
          quarter:   q.quarter,
          startDate: q.startDate,
          endDate:   q.endDate,
          weekCount: q.weekCount ?? 13,
          createdBy: userId,
        },
      })
    )
  );

  // Persist the (informational) weekly meeting day when supplied in custom mode.
  if (customEnabled && weeklyMeetingDay != null) {
    await db.featureFlag.upsert({
      where: { orgId_key: { orgId, key: "weekly_meeting_day" } },
      create: { orgId, key: "weekly_meeting_day", name: "weekly meeting day", enabled: true, value: weeklyMeetingDay },
      update: { value: weeklyMeetingDay },
    });
  }

  const userMap = {
    [userId]: {
      firstName: session.user?.name?.split(" ")[0] ?? "",
      lastName: session.user?.name?.split(" ").slice(1).join(" ") ?? "",
    },
  };

  return NextResponse.json({
    success: true,
    data: created.map(r => serializeRow(r, userMap)),
  }, { status: 201 });
}, { fallbackErrorMessage: "Failed to generate quarters" });

/* ─── DELETE /api/org/quarters?year=YYYY ────────────────────────────────────
 *
 * Hard-deletes every QuarterSetting row for the tenant + given fiscal year.
 * Intended for Quarter Settings → "Delete Fiscal Year". Per-quarter deletes
 * continue to live at DELETE /api/org/quarters/[id].
 *
 * Caller must have the orgSetup.quarters module license (same gate as
 * POST/PUT, now enforced by the shared wrapper). No cascade — rows in
 * KPI / Priority / OPSP that reference (fiscalYear, quarter) by value keep
 * their values; the picker will just drop the year from its DB-scoped list.
 */
export const DELETE = withOrgAuth(async ({ orgId }, request: NextRequest) => {
  const yearParam = request.nextUrl.searchParams.get("year");
  if (!yearParam)
    return NextResponse.json({ success: false, error: "year query param required" }, { status: 400 });
  const fiscalYear = parseInt(yearParam, 10);
  if (!Number.isFinite(fiscalYear))
    return NextResponse.json({ success: false, error: "Invalid fiscal year" }, { status: 400 });

  if (await fyHasData(orgId, fiscalYear))
    return NextResponse.json({
      success: false,
      error: `Fiscal year cannot be deleted — data exists for ${fyLabel(fiscalYear)}.`,
    }, { status: 409 });

  const result = await db.quarterSetting.deleteMany({
    where: { orgId, fiscalYear },
  });

  if (result.count === 0)
    return NextResponse.json({ success: false, error: "No quarters found for that fiscal year" }, { status: 404 });

  return NextResponse.json({ success: true, data: { fiscalYear, deleted: result.count } });
}, { fallbackErrorMessage: "Failed to delete fiscal year" });
