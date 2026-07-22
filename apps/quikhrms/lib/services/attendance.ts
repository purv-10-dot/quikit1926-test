import { prisma } from "@/lib/prisma";

export type DayStatus = "Present" | "Absent" | "HalfDay" | "Weekend" | "Holiday" | "OnLeave" | "OnDuty" | "CompOff" | "WFH" | "NotMarked";

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
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const [records, shiftAssign, holidays, leaves, rosterEntries, company] = await Promise.all([
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
      select: { workHoursPerDay: true },
    }),
  ]);

  // Standard paid hours per day — drives the Days→Hours conversion for
  // non-worked categories (leave, holiday, weekend). Default 8h.
  const workHoursPerDay = Number(company?.workHoursPerDay ?? 8) || 8;

  const shift = shiftAssign?.shift
    ? { name: shiftAssign.shift.name, start: shiftAssign.shift.startTime, end: shiftAssign.shift.endTime, weekOffs: shiftAssign.shift.weekOffs }
    : { name: "General", start: "09:00", end: "18:00", weekOffs: [0, 6] as unknown };

  const weekOffs = Array.isArray(shift.weekOffs) ? (shift.weekOffs as number[]) : [0, 6];

  const recordByDate = new Map(records.map((r) => [r.date.toISOString().slice(0, 10), r]));
  const holidayByDate = new Map(holidays.map((h) => [h.date.toISOString().slice(0, 10), h]));
  const rosterByDate = new Map(rosterEntries.map((e) => [e.date.toISOString().slice(0, 10), e]));

  const days: DayCell[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const dow = d.getDay();

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
      status = (rec.status as DayStatus) ?? "Present";
    } else if (leave) {
      status = "OnLeave";
    } else if (hol) {
      status = "Holiday";
    } else if (isRosterWeekOff) {
      status = "Weekend";
    } else if (isRosterDuty) {
      status = d > new Date() ? "NotMarked" : "Absent";
    } else if (weekOffs.includes(dow)) {
      status = "Weekend";
    } else if (d > new Date()) {
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

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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
    const today = startOfToday();
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
