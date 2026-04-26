import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { toErrorMessage } from "@/lib/api/errors";
import { generateQuartersSchema } from "@/lib/schemas/quarterSchema";
import { addDays, generateQuarterDates } from "@/lib/utils/quarterGen";
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

    // ── Future FY Visibility ──
    // Single on/off gate: `enable_future_quarters`. When enabled, the next FY
    // after the highest configured one is surfaced regardless of proximity to
    // the current quarter's end. Overlap is prevented server-side by the
    // contiguity check in POST (startDate must be after the latest existing
    // quarter's endDate).
    let futureYearAvailable: number | null = null;

    const futureFlag = await db.featureFlag.findFirst({
      where: { tenantId, key: "enable_future_quarters" },
      select: { enabled: true },
    });
    const futureEnabled = futureFlag?.enabled ?? false;

    if (futureEnabled) {
      const highestExistingFY = availableYears[0] ?? null;
      if (highestExistingFY !== null) {
        const nextFY = highestExistingFY + 1;
        if (!availableYears.includes(nextFY)) {
          futureYearAvailable = nextFY;
          availableYears.unshift(nextFY);
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

    // Tenant-wide latest endDate (across all FYs) — used by the Generate
    // modal to pre-fill the next FY's start date as latestEnd + 1 so users
    // don't have to remember where the previous FY ended.
    const latestRow = await db.quarterSetting.findFirst({
      where: { tenantId },
      orderBy: { endDate: "desc" },
      select: { endDate: true },
    });

    return NextResponse.json({
      success:        true,
      data:           rows.map(r => serializeRow(r, userMap)),
      availableYears: availableYears.sort((a, b) => b - a),
      futureYearAvailable,
      latestEndDate:  latestRow?.endDate.toISOString() ?? null,
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
        where: { tenantId, key: "enable_future_quarters" },
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
      where: { tenantId, fiscalYear },
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
        where: { tenantId },
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

/* ─── DELETE /api/org/quarters?year=YYYY ────────────────────────────────────
 *
 * Hard-deletes every QuarterSetting row for the tenant + given fiscal year.
 * Intended for Quarter Settings → "Delete Fiscal Year". Per-quarter deletes
 * continue to live at DELETE /api/org/quarters/[id].
 *
 * Caller must have the orgSetup.quarters module license (same gate as
 * POST/PUT). No cascade — rows in KPI / Priority / OPSP that reference
 * (fiscalYear, quarter) by value keep their values; the picker will just
 * drop the year from its DB-scoped list.
 */
export async function DELETE(request: NextRequest) {
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

    const yearParam = request.nextUrl.searchParams.get("year");
    if (!yearParam)
      return NextResponse.json({ success: false, error: "year query param required" }, { status: 400 });
    const fiscalYear = parseInt(yearParam, 10);
    if (!Number.isFinite(fiscalYear))
      return NextResponse.json({ success: false, error: "Invalid fiscal year" }, { status: 400 });

    const result = await db.quarterSetting.deleteMany({
      where: { tenantId, fiscalYear },
    });

    if (result.count === 0)
      return NextResponse.json({ success: false, error: "No quarters found for that fiscal year" }, { status: 404 });

    return NextResponse.json({ success: true, data: { fiscalYear, deleted: result.count } });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to delete fiscal year") }, { status: 500 });
  }
}
