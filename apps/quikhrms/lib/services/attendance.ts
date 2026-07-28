import { prisma } from "@/lib/prisma";
import { attendanceDayStart } from "@/lib/attendance/day";

const DAY_NAME_TO_NUM: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

/**
 * Derive week-off day numbers (0=Sun … 6=Sat) from the company profile's
 * `workWeek` (the list of WORKING day names). Week-offs are the days NOT worked.
 * Returns null when workWeek is empty/unset so callers fall through to the next
 * source in the precedence chain.
 */
function companyWeekOffs(workWeek: unknown): number[] | null {
  if (!Array.isArray(workWeek) || workWeek.length === 0) return null;
  const working = new Set(
    (workWeek as unknown[])
      .map((d) => (typeof d === "string" ? DAY_NAME_TO_NUM[d.toLowerCase()] : undefined))
      .filter((n): n is number => n != null),
  );
  if (working.size === 0) return null;
  return [0, 1, 2, 3, 4, 5, 6].filter((n) => !working.has(n));
}

export type DayStatus = "Present" | "Absent" | "HalfDay" | "Weekend" | "Holiday" | "OnLeave" | "OnDuty" | "CompOff" | "WFH" | "NotMarked" | "Missing";

export interface DayCell {
  recordId: string | null;
  date: Date;
  dayOfWeek: number;
  status: DayStatus;
  checkIn: Date | null;
  checkOut: Date | null;
  /** Every clock-in/clock-out session for the day (ISO strings, open `out === null`). */
  punches: { in: string; out: string | null }[];
  grossHours: number;
  effectiveHours: number;
  isLate: boolean;
  lateByMinutes: number;
  shift: { name: string; start: string; end: string } | null;
  holidayName: string | null;
  leaveTypeName: string | null;
  remarks: string | null;
  regularizationStatus: "None" | "Pending" | "Approved" | "Rejected";
  regularizationReason: string | null;
}

export interface WeekSummary {
  days: DayCell[];
  totals: {
    payableDays: number;
    presentDays: number;
    onDutyDays: number;
    paidLeaveDays: number;
    holidayDays: number;
    weekendDays: number;
    absentDays: number;
    totalHours: number;
    // Hours view (Days/Hours toggle). Worked categories use actual effective
    // hours; non-worked-but-payable categories use days × workHoursPerDay.
    payableHours: number;
    presentHours: number;
    onDutyHours: number;
    paidLeaveHours: number;
    holidayHours: number;
    weekendHours: number;
  };
  shift: { name: string; start: string; end: string } | null;
}

export async function getWeekSummary(orgId: string, employeeId: string, weekStart: Date): Promise<WeekSummary> {
  // Bucket by the IST calendar date (stored as UTC-midnight), matching how
  // attendance records are keyed — so the grid days line up with records on ANY
  // server timezone. (Local-midnight + toISOString shifted days by one on IST.)
  const start = attendanceDayStart(weekStart);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);

  const [records, shiftAssign, holidays, leaves, rosterEntries, company, employee] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { orgId, employeeId, date: { gte: start, lte: end }, deletedAt: null },
      orderBy: { date: "asc" },
    }),
    prisma.shiftAssignment.findFirst({
      where: {
        orgId, employeeId, deletedAt: null,
        effectiveFrom: { lte: end },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
      },
      include: { shift: true },
      orderBy: { effectiveFrom: "desc" },
    }),
    prisma.companyHoliday.findMany({
      where: { orgId, deletedAt: null, date: { gte: start, lte: end } },
    }),
    prisma.leaveRequest.findMany({
      where: {
        orgId, employeeId, deletedAt: null, status: "Approved",
        startDate: { lte: end }, endDate: { gte: start },
      },
      include: { leaveType: { select: { name: true, isPaid: true } } },
    }),
    // Published roster drives the per-day expected shift / week-off.
    prisma.rosterEntry.findMany({
      where: {
        orgId, employeeId, deletedAt: null,
        date: { gte: start, lte: end },
        roster: { status: "Published", deletedAt: null },
      },
      include: { shift: true },
    }),
    prisma.companySettings.findUnique({
      where: { orgId },
      select: { workHoursPerDay: true, workWeek: true },
    }),
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { weeklyOffDays: true },
    }),
  ]);

  // Standard paid hours per day — drives the Days→Hours conversion for
  // non-worked categories (leave, holiday, weekend). Default 8h.
  const workHoursPerDay = Number(company?.workHoursPerDay ?? 8) || 8;

  const shift = shiftAssign?.shift
    ? { name: shiftAssign.shift.name, start: shiftAssign.shift.startTime, end: shiftAssign.shift.endTime, weekOffs: shiftAssign.shift.weekOffs }
    : { name: "General", start: "09:00", end: "18:00", weekOffs: null as unknown };

  // Week-off precedence (most specific wins). A per-date roster entry (handled
  // in the day loop below) always overrides this baseline pattern:
  //   employee's own weekly-offs → shift week-offs → company profile (workWeek)
  //   → Sat/Sun fallback.
  const asDayNums = (v: unknown): number[] | null => {
    if (!Array.isArray(v) || v.length === 0) return null;
    const nums = (v as unknown[]).filter((n) => typeof n === "number") as number[];
    return nums.length ? nums : null;
  };
  const empOff = asDayNums(employee?.weeklyOffDays);
  const shiftOff = asDayNums(shift.weekOffs);
  const companyOff = companyWeekOffs(company?.workWeek);
  const weekOffs = empOff ?? shiftOff ?? companyOff ?? [0, 6];

  const recordByDate = new Map(records.map((r) => [r.date.toISOString().slice(0, 10), r]));
  const holidayByDate = new Map(holidays.map((h) => [h.date.toISOString().slice(0, 10), h]));
  const rosterByDate = new Map(rosterEntries.map((e) => [e.date.toISOString().slice(0, 10), e]));

  // Start of today's IST date (UTC-midnight) — used to flag past days with a
  // missing exit time and to separate past / today / future.
  const todayStart = attendanceDayStart();

  const days: DayCell[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();

    const rec = recordByDate.get(key);
    const hol = holidayByDate.get(key);
    const rosterEntry = rosterByDate.get(key);
    const leave = leaves.find((l) => {
      const ls = new Date(l.startDate).setHours(0, 0, 0, 0);
      const le = new Date(l.endDate).setHours(23, 59, 59, 999);
      return d.getTime() >= ls && d.getTime() <= le;
    });

    // Published roster overrides the shift-template week-off pattern for this day.
    const isRosterWeekOff = rosterEntry?.type === "WeekOff";
    const isRosterDuty = rosterEntry?.type === "Duty";
    const dayShift = isRosterDuty && rosterEntry?.shift
      ? { name: rosterEntry.shift.name, start: rosterEntry.shift.startTime, end: rosterEntry.shift.endTime }
      : { name: shift.name, start: shift.start, end: shift.end };

    let status: DayStatus;
    if (rec?.checkIn) {
      // Checked in but no exit time recorded, and the day is already over →
      // flag as "Missing" so the employee can regularize (add the exit time).
      // A still-open punch on the current day stays "Present" (may still be working).
      if (!rec.checkOut && d < todayStart) {
        status = "Missing";
      } else {
        status = (rec.status as DayStatus) ?? "Present";
      }
    } else if (leave) {
      status = "OnLeave";
    } else if (hol) {
      status = "Holiday";
    } else if (isRosterWeekOff) {
      status = "Weekend";
    } else if (isRosterDuty) {
      status = d > todayStart ? "NotMarked" : "Absent";
    } else if (weekOffs.includes(dow)) {
      status = "Weekend";
    } else if (d > todayStart) {
      status = "NotMarked";
    } else {
      status = "Absent";
    }

    days.push({
      recordId: rec?.id ?? null,
      date: d,
      dayOfWeek: dow,
      status,
      checkIn: rec?.checkIn ?? null,
      checkOut: rec?.checkOut ?? null,
      punches: Array.isArray(rec?.punches) ? (rec!.punches as Punch[]) : [],
      grossHours: Number(rec?.grossHours ?? 0),
      effectiveHours: Number(rec?.effectiveHours ?? 0),
      isLate: rec?.isLateCheckIn ?? false,
      lateByMinutes: rec?.lateByMinutes ?? 0,
      shift: dayShift,
      holidayName: hol?.name ?? null,
      leaveTypeName: leave?.leaveType.name ?? null,
      remarks: rec?.remarks ?? null,
      regularizationStatus: ((rec as { regularizationStatus?: string } | undefined)?.regularizationStatus as "Pending" | "Approved" | "Rejected" | undefined) ?? "None",
      regularizationReason: ((rec as { regularizationReason?: string | null } | undefined)?.regularizationReason) ?? null,
    });
  }

  // Totals only count days that have actually occurred. Future days still carry
  // a display status (e.g. an upcoming Saturday shows as "Weekend" in the
  // calendar), but counting them here would inflate payable days with days that
  // haven't happened yet.
  const now = new Date();
  const elapsed = days.filter((d) => d.date <= now);

  const presentCells = elapsed.filter((d) => d.status === "Present" || d.status === "WFH" || d.status === "OnDuty");
  const onDutyCells = elapsed.filter((d) => d.status === "OnDuty");
  const sumHours = (cells: DayCell[]) => cells.reduce((s, d) => s + d.effectiveHours, 0);

  const totals = {
    presentDays: presentCells.length,
    onDutyDays: onDutyCells.length,
    paidLeaveDays: elapsed.filter((d) => d.status === "OnLeave" && leaves.find((l) => l.leaveType.isPaid)).length,
    holidayDays: elapsed.filter((d) => d.status === "Holiday").length,
    weekendDays: elapsed.filter((d) => d.status === "Weekend").length,
    absentDays: elapsed.filter((d) => d.status === "Absent").length,
    totalHours: elapsed.reduce((s, d) => s + d.effectiveHours, 0),
    payableDays: 0,
    // Hours view — worked categories use real effective hours; the rest are
    // days × standard workHoursPerDay.
    presentHours: sumHours(presentCells),
    onDutyHours: sumHours(onDutyCells),
    paidLeaveHours: 0,
    holidayHours: 0,
    weekendHours: 0,
    payableHours: 0,
  };
  totals.payableDays = totals.presentDays + totals.paidLeaveDays + totals.holidayDays + totals.weekendDays;
  totals.paidLeaveHours = totals.paidLeaveDays * workHoursPerDay;
  totals.holidayHours = totals.holidayDays * workHoursPerDay;
  totals.weekendHours = totals.weekendDays * workHoursPerDay;
  totals.payableHours = totals.presentHours + totals.paidLeaveHours + totals.holidayHours + totals.weekendHours;

  return { days, totals, shift: { name: shift.name, start: shift.start, end: shift.end } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto attendance on login / logout
// Mirrors the manual /attendance/check-in & /check-out punch logic, but is
// best-effort: it never throws, so a hiccup here can't block sign-in/out.
// ─────────────────────────────────────────────────────────────────────────────

type Punch = { in: string; out: string | null };

/**
 * Clock the employee in when they log in. Opens a new punch on today's record
 * (creating the record if needed). Idempotent — if a punch is already open
 * (e.g. they logged in again without logging out), it does nothing.
 */
export async function autoClockIn(
  orgId: string,
  employeeId: string,
  ipAddress?: string | null,
): Promise<void> {
  try {
    // Bucket on the same IST day key as manual check-in/out and getWeekSummary,
    // so auto-punches don't land on a different (local/UTC-midnight) day.
    const today = attendanceDayStart();
    const existing = await prisma.attendanceRecord.findFirst({
      where: { orgId, employeeId, date: today, deletedAt: null },
    });
    const now = new Date();
    const punches: Punch[] = Array.isArray(existing?.punches) ? (existing!.punches as Punch[]) : [];

    if (punches.some((p) => !p.out)) return; // already clocked in

    const newPunches: Punch[] = [...punches, { in: now.toISOString(), out: null }];

    if (existing) {
      await prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: {
          checkIn: existing.checkIn ?? now,
          checkOut: null,
          punches: newPunches as object,
          status: "Present",
          source: "Web",
          ipAddress: ipAddress ?? existing.ipAddress,
          updatedBy: employeeId,
        },
      });
    } else {
      await prisma.attendanceRecord.create({
        data: {
          orgId,
          employeeId,
          date: today,
          checkIn: now,
          punches: newPunches as object,
          status: "Present",
          source: "Web",
          ipAddress: ipAddress ?? undefined,
          createdBy: employeeId,
          updatedBy: employeeId,
        },
      });
    }
  } catch (err) {
    console.error("[attendance] autoClockIn failed:", err);
  }
}

/**
 * Clock the employee out when they log out. Closes the open punch on today's
 * record and recomputes gross/effective hours. No-op if there's no open punch.
 */
export async function autoClockOut(orgId: string, employeeId: string): Promise<void> {
  try {
    // Find by OPEN punch, not by "today": an overtime / night session can be
    // closed after midnight, so the open punch may live on a *prior* day's
    // record. The punch is anchored to its check-in day; `checkOut: null`
    // reliably marks the record with the open punch (autoClockIn sets it null,
    // we set it here on close). Most-recent open record = the active session.
    const record = await prisma.attendanceRecord.findFirst({
      where: { orgId, employeeId, deletedAt: null, checkOut: null },
      orderBy: { date: "desc" },
    });
    if (!record) return;

    const punches: Punch[] = Array.isArray(record.punches) ? (record.punches as Punch[]) : [];
    const openIdx = punches.findIndex((p) => !p.out);
    if (openIdx === -1) return; // nothing open to close

    const now = new Date();
    punches[openIdx] = { ...punches[openIdx], out: now.toISOString() };

    const totalMs = punches.reduce(
      (sum, p) => (p.out ? sum + (new Date(p.out).getTime() - new Date(p.in).getTime()) : sum),
      0,
    );
    const grossHours = totalMs / (1000 * 60 * 60);
    const breakHours = Number(record.breakDuration ?? 0);
    const effectiveHours = Math.max(0, grossHours - breakHours);

    await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        checkOut: now,
        punches: punches as object,
        grossHours: Math.round(grossHours * 100) / 100,
        effectiveHours: Math.round(effectiveHours * 100) / 100,
        updatedBy: employeeId,
      },
    });
  } catch (err) {
    console.error("[attendance] autoClockOut failed:", err);
  }
}
