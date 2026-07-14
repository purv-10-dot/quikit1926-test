import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateQuarterSchema } from "@/lib/schemas/quarterSchema";
import { addDays, generateMonthlyQuarterDates, chainQuarterDates, isMonthBasedWeekCounts } from "@/lib/utils/quarterGen";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { fyHasData, fyLabel } from "@/lib/api/quartersFyHasData";
import { getCustomQuarterEnabled } from "@/lib/utils/featureFlags";
import { generateMeetingDayWeeks, meetingDayIndex } from "@/lib/utils/fiscal";
const withOrgAuth = withOrgAuthForModule("orgSetup.quarters");

const DAYS_PER_QUARTER = 91; // 13 weeks

function serializeQuarter(
  q: { id: string; fiscalYear: number; quarter: string; startDate: Date; endDate: Date; weekCount: number; createdAt: Date; updatedAt: Date; createdBy: string },
  user: { firstName: string; lastName: string } | null,
) {
  const name = user ? `${user.firstName} ${user.lastName}` : "—";
  const ini = user ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() : "??";
  return {
    id: q.id, fiscalYear: q.fiscalYear, quarter: q.quarter,
    startDate: q.startDate.toISOString(), endDate: q.endDate.toISOString(),
    weekCount: q.weekCount,
    createdAt: q.createdAt.toISOString(), updatedAt: q.updatedAt.toISOString(),
    createdBy: q.createdBy, createdByName: name, createdByInitials: ini,
  };
}

// PUT /api/org/quarters/[id] — only Q1 start date can be changed, recalculates all quarters
export const PUT = withOrgAuth<{ id: string }>(async ({ orgId }, request, { params }) => {
    const existing = await db.quarterSetting.findFirst({ where: { id: params.id, orgId } });
    if (!existing)
      return NextResponse.json({ success: false, error: "Quarter not found" }, { status: 404 });

    const customEnabled = await getCustomQuarterEnabled(orgId);
    const meetingDayFlag = await db.featureFlag.findFirst({
      where: { orgId, key: "weekly_meeting_day" },
      select: { value: true },
    });
    const meetingDayValue = meetingDayFlag?.value ?? null;

    // Legacy mode: only Q1's start date can be changed (others auto-calculate).
    // Custom mode: any quarter's weekCount (and Q1's start) can be edited.
    if (!customEnabled && existing.quarter !== "Q1")
      return NextResponse.json({ success: false, error: "Only Q1 start date can be changed. All other quarters are auto-calculated." }, { status: 400 });

    // Lock once any KPI / Priority / OPSP exists for this FY — changing a
    // quarter boundary or week count would orphan existing data.
    if (await fyHasData(orgId, existing.fiscalYear))
      return NextResponse.json({
        success: false,
        error: `Quarter dates are locked — data exists for ${fyLabel(existing.fiscalYear)}.`,
      }, { status: 409 });

    const parsed = updateQuarterSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    const startDateStr = parsed.data.startDate;

    // Custom Quarter Settings: the meeting day is editable from the quarter
    // edit panel while the FY is unlocked (this handler already 409s above once
    // data exists). Persist the new org-level value and use it for the week
    // re-derivation below, so a Thu→Wed switch immediately recomputes 13/14.
    let effectiveMeetingDay = meetingDayValue;
    if (customEnabled && parsed.data.weeklyMeetingDay != null) {
      effectiveMeetingDay = parsed.data.weeklyMeetingDay;
      await db.featureFlag.upsert({
        where: { orgId_key: { orgId, key: "weekly_meeting_day" } },
        create: { orgId, key: "weekly_meeting_day", name: "weekly meeting day", enabled: true, value: effectiveMeetingDay },
        update: { value: effectiveMeetingDay },
      });
    }

    // Get all 4 quarters for this FY
    const allQuarters = await db.quarterSetting.findMany({
      where: { orgId, fiscalYear: existing.fiscalYear },
      orderBy: { quarter: "asc" },
    });

    if (allQuarters.length !== 4)
      return NextResponse.json({ success: false, error: "Incomplete FY — expected 4 quarters" }, { status: 400 });

    const quarterOrder = ["Q1", "Q2", "Q3", "Q4"];
    const byName = Object.fromEntries(allQuarters.map(q => [q.quarter, q]));
    let quarterDates: { quarter: string; startDate: Date; endDate: Date; weekCount?: number }[];

    if (customEnabled) {
      // Custom: reconstruct the per-quarter week counts from the persisted rows,
      // apply the edit (weekCount for this quarter; startDate for Q1), then pick
      // the generator below.
      let q1Start = byName["Q1"].startDate;
      if (existing.quarter === "Q1" && startDateStr) {
        const d = new Date(startDateStr);
        if (isNaN(d.getTime()))
          return NextResponse.json({ success: false, error: "Invalid start date" }, { status: 400 });
        q1Start = d;
      }
      const mdIdx = meetingDayIndex(effectiveMeetingDay);
      if (mdIdx !== null) {
        // Meeting-day mode: quarter dates are always calendar-month based and
        // each quarter's week count is DERIVED from the meeting-day chain
        // (13 or 14, incl. partial weeks). The persisted counts are outputs
        // here, so we must NOT feed them back into the generator selection
        // (that would flip a 14-week FY to chained, non-month dates). Any
        // manual `weekCount` in the request is ignored — it's UI-disabled.
        quarterDates = generateMonthlyQuarterDates(q1Start);
        for (const q of quarterDates) {
          const s = q.startDate.toISOString().slice(0, 10);
          const e = q.endDate.toISOString().slice(0, 10);
          q.weekCount = generateMeetingDayWeeks(s, e, mdIdx).length;
        }
      } else {
        const weekCounts = quarterOrder.map(n => byName[n].weekCount ?? 13);
        if (parsed.data.weekCount != null) {
          weekCounts[quarterOrder.indexOf(existing.quarter)] = parsed.data.weekCount;
        }
        // No meeting day — pick the generator the same way POST does: all-13 →
        // month-based calendar quarters, any ≠ 13 → week-based chained quarters.
        quarterDates = isMonthBasedWeekCounts(weekCounts)
          ? generateMonthlyQuarterDates(q1Start)
          : chainQuarterDates(q1Start, weekCounts);
      }
    } else {
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

      // Recalculate all 4 quarters (Q1-Q3: 91 days, Q4 absorbs remainder)
      quarterDates = [];
      let cursor = new Date(newQ1Start.getTime());
      for (let i = 0; i < 4; i++) {
        const qStart = new Date(cursor.getTime());
        const qEnd = i === 3 ? fyEnd : addDays(qStart, DAYS_PER_QUARTER - 1);
        quarterDates.push({ quarter: quarterOrder[i], startDate: qStart, endDate: qEnd });
        cursor = addDays(qEnd, 1);
      }
    }

    // Update all 4 quarters
    await Promise.all(
      quarterOrder.map((qName, i) => {
        const q = byName[qName];
        return db.quarterSetting.update({
          where: { id: q.id },
          data: {
            startDate: quarterDates[i].startDate,
            endDate: quarterDates[i].endDate,
            ...(quarterDates[i].weekCount != null && { weekCount: quarterDates[i].weekCount }),
          },
        });
      })
    );

    // Fetch all updated quarters
    const updatedAll = await db.quarterSetting.findMany({
      where: { orgId, fiscalYear: existing.fiscalYear },
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
export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId }, _request, { params }) => {
    const existing = await db.quarterSetting.findFirst({ where: { id: params.id, orgId } });
    if (!existing)
      return NextResponse.json({ success: false, error: "Quarter not found" }, { status: 404 });

    if (await fyHasData(orgId, existing.fiscalYear))
      return NextResponse.json({
        success: false,
        error: `Quarter cannot be deleted — data exists for ${fyLabel(existing.fiscalYear)}.`,
      }, { status: 409 });

    await db.quarterSetting.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
}, { fallbackErrorMessage: "Failed to delete quarter" });
