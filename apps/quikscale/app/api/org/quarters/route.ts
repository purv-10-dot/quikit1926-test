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

/** Compute quarter start/end from fiscal year start month (1–12). */
function computeQuarterDates(
  fiscalYear: number,
  quarter: string,
  fiscalStartMonth: number, // 1=Jan, 4=Apr …
): { start: Date; end: Date } {
  const qIndex = ["Q1", "Q2", "Q3", "Q4"].indexOf(quarter);
  const fsm0   = fiscalStartMonth - 1; // 0-indexed

  const startOffset = fsm0 + qIndex * 3;
  const startM0     = startOffset % 12;
  const startY      = fiscalYear + Math.floor(startOffset / 12);

  const endOffset   = startOffset + 3;
  const endM0       = endOffset % 12;
  const endY        = fiscalYear + Math.floor(endOffset / 12);

  return {
    start: new Date(startY, startM0, 1),
    end:   new Date(endY, endM0, 0), // day-0 = last day of previous month
  };
}

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

// GET /api/org/quarters?year=2026
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

    // Also return all available fiscal years for the year picker
    const allYears = await db.quarterSetting.findMany({
      where:    { tenantId },
      select:   { fiscalYear: true },
      distinct: ["fiscalYear"],
      orderBy:  { fiscalYear: "desc" },
    });

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
      availableYears: allYears.map(r => r.fiscalYear),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch quarters";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST /api/org/quarters — generate all 4 quarters for a fiscal year
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const membership = await getMembership(session.user.id);
    if (!membership)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const { tenantId } = membership;
    const fiscalStartMonth = membership.tenant.fiscalYearStart ?? 4; // default April

    const body = await request.json();
    const { fiscalYear } = body;
    if (!fiscalYear || typeof fiscalYear !== "number")
      return NextResponse.json({ success: false, error: "fiscalYear is required" }, { status: 400 });

    // Check if quarters already exist
    const existing = await db.quarterSetting.findMany({
      where: { tenantId, fiscalYear },
    });
    if (existing.length > 0)
      return NextResponse.json({ success: false, error: `Quarters for ${fiscalYear}–${fiscalYear + 1} already exist` }, { status: 409 });

    const quarters = ["Q1", "Q2", "Q3", "Q4"];
    const created = await Promise.all(quarters.map(q => {
      const { start, end } = computeQuarterDates(fiscalYear, q, fiscalStartMonth);
      return db.quarterSetting.create({
        data: {
          tenantId,
          fiscalYear,
          quarter:   q,
          startDate: start,
          endDate:   end,
          createdBy: session.user!.id,
        },
      });
    }));

    const userMap = { [session.user.id]: { firstName: session.user.name?.split(" ")[0] ?? "", lastName: session.user.name?.split(" ").slice(1).join(" ") ?? "" } };
    return NextResponse.json({
      success: true,
      data:    created.map(r => serializeRow(r, userMap)),
    }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to generate quarters";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
