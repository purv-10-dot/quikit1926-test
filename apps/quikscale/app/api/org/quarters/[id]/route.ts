import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateQuarterSchema } from "@/lib/schemas/quarterSchema";
import { addDays } from "@/lib/utils/quarterGen";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("orgSetup.quarters");

const DAYS_PER_QUARTER = 91; // 13 weeks

function serializeQuarter(
  q: { id: string; fiscalYear: number; quarter: string; startDate: Date; endDate: Date; createdAt: Date; updatedAt: Date; createdBy: string },
  user: { firstName: string; lastName: string } | null,
) {
  const name = user ? `${user.firstName} ${user.lastName}` : "—";
  const ini = user ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() : "??";
  return {
    id: q.id, fiscalYear: q.fiscalYear, quarter: q.quarter,
    startDate: q.startDate.toISOString(), endDate: q.endDate.toISOString(),
    createdAt: q.createdAt.toISOString(), updatedAt: q.updatedAt.toISOString(),
    createdBy: q.createdBy, createdByName: name, createdByInitials: ini,
  };
}

// PUT /api/org/quarters/[id] — only Q1 start date can be changed, recalculates all quarters
export const PUT = withTenantAuth<{ id: string }>(async ({ tenantId }, request, { params }) => {
    const existing = await db.quarterSetting.findFirst({ where: { id: params.id, tenantId } });
    if (!existing)
      return NextResponse.json({ success: false, error: "Quarter not found" }, { status: 404 });

    // Only Q1 can be edited
    if (existing.quarter !== "Q1")
      return NextResponse.json({ success: false, error: "Only Q1 start date can be changed. All other quarters are auto-calculated." }, { status: 400 });

    const parsed = updateQuarterSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    const startDateStr = parsed.data.startDate;

    if (!startDateStr)
      return NextResponse.json({ success: false, error: "Start date is required" }, { status: 400 });

    const newQ1Start = new Date(startDateStr);
    if (isNaN(newQ1Start.getTime()))
      return NextResponse.json({ success: false, error: "Invalid start date" }, { status: 400 });

    // FY end = Q1 start + 1 year - 1 day
    const fyEnd = addDays(
      new Date(Date.UTC(newQ1Start.getUTCFullYear() + 1, newQ1Start.getUTCMonth(), newQ1Start.getUTCDate())),
      -1
    );

    // Recalculate all 4 quarters
    const quarterDates: { quarter: string; startDate: Date; endDate: Date }[] = [];
    let cursor = new Date(newQ1Start.getTime());

    for (let i = 0; i < 4; i++) {
      const qStart = new Date(cursor.getTime());
      const qEnd = i === 3
        ? fyEnd // Q4 ends at FY end (absorbs remaining days)
        : addDays(qStart, DAYS_PER_QUARTER - 1); // Q1-Q3: 91 days each

      quarterDates.push({
        quarter: ["Q1", "Q2", "Q3", "Q4"][i],
        startDate: qStart,
        endDate: qEnd,
      });
      cursor = addDays(qEnd, 1);
    }

    // Get all 4 quarters for this FY
    const allQuarters = await db.quarterSetting.findMany({
      where: { tenantId, fiscalYear: existing.fiscalYear },
      orderBy: { quarter: "asc" },
    });

    if (allQuarters.length !== 4)
      return NextResponse.json({ success: false, error: "Incomplete FY — expected 4 quarters" }, { status: 400 });

    // Update all 4 quarters
    const quarterOrder = ["Q1", "Q2", "Q3", "Q4"];
    await Promise.all(
      quarterOrder.map((qName, i) => {
        const q = allQuarters.find(r => r.quarter === qName)!;
        return db.quarterSetting.update({
          where: { id: q.id },
          data: { startDate: quarterDates[i].startDate, endDate: quarterDates[i].endDate },
        });
      })
    );

    // Fetch all updated quarters
    const updatedAll = await db.quarterSetting.findMany({
      where: { tenantId, fiscalYear: existing.fiscalYear },
      orderBy: { quarter: "asc" },
    });

    const userIds = [...new Set(updatedAll.map(r => r.createdBy))];
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    return NextResponse.json({
      success: true,
      data: updatedAll.map(q => serializeQuarter(q, userMap[q.createdBy] || null)),
    });
}, { fallbackErrorMessage: "Failed to update quarter" });

// DELETE /api/org/quarters/[id]
export const DELETE = withTenantAuth<{ id: string }>(async ({ tenantId }, _request, { params }) => {
    const existing = await db.quarterSetting.findFirst({ where: { id: params.id, tenantId } });
    if (!existing)
      return NextResponse.json({ success: false, error: "Quarter not found" }, { status: 404 });

    await db.quarterSetting.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
}, { fallbackErrorMessage: "Failed to delete quarter" });
