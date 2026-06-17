import { prisma } from "@/lib/prisma";
import type { ReportDefinition } from "../types";
import { fmtDate, fullName, num, dateRange } from "../format";

const empSelect = { employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } } as const;
const fmtTime = (d: Date | null) => (d ? d.toISOString().slice(11, 16) : "");

// Default attendance reports to the last 31 days when no range is given.
function attRange(dateFrom?: Date, dateTo?: Date) {
  if (dateFrom || dateTo) return dateRange("date", dateFrom, dateTo);
  const to = new Date();
  const from = new Date(to.getTime() - 31 * 86_400_000);
  return dateRange("date", from, to);
}

export const attendanceReports: ReportDefinition[] = [
  {
    key: "attendance-daily-register",
    label: "Daily Attendance Register",
    description: "Per-day punch records with status and hours (defaults to last 31 days).",
    category: "Attendance",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const recs = await prisma.attendanceRecord.findMany({
        where: { orgId, deletedAt: null, ...attRange(dateFrom, dateTo) },
        include: { employee: { select: empSelect } },
        orderBy: [{ date: "desc" }, { employeeId: "asc" }],
        take: 10000,
      });
      return {
        title: "Daily Attendance Register",
        columns: [
          { key: "date", label: "Date", width: 12 },
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "department", label: "Department", width: 16 },
          { key: "checkIn", label: "Check In", width: 10 },
          { key: "checkOut", label: "Check Out", width: 10 },
          { key: "hours", label: "Hours", width: 8 },
          { key: "status", label: "Status", width: 12 },
          { key: "late", label: "Late (min)", width: 10 },
          { key: "source", label: "Source", width: 10 },
        ],
        rows: recs.map((r) => ({
          date: fmtDate(r.date),
          code: r.employee?.employeeCode ?? "",
          name: fullName(r.employee),
          department: r.employee?.department?.name ?? "",
          checkIn: fmtTime(r.checkIn),
          checkOut: fmtTime(r.checkOut),
          hours: num(r.effectiveHours),
          status: r.status,
          late: r.lateByMinutes,
          source: r.source ?? "",
        })),
      };
    },
  },
  {
    key: "attendance-monthly-summary",
    label: "Monthly Attendance Summary",
    description: "Present / absent / leave / WFH day counts per employee for the period.",
    category: "Attendance",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const recs = await prisma.attendanceRecord.findMany({
        where: { orgId, deletedAt: null, ...attRange(dateFrom, dateTo) },
        include: { employee: { select: empSelect } },
        take: 50000,
      });
      const map = new Map<string, Record<string, unknown>>();
      for (const r of recs) {
        const k = r.employeeId;
        const row = map.get(k) ?? { code: r.employee?.employeeCode ?? "", name: fullName(r.employee), department: r.employee?.department?.name ?? "", present: 0, absent: 0, leave: 0, halfDay: 0, wfh: 0, weekOff: 0, holiday: 0 };
        if (r.status === "Present" || r.status === "OnDuty") (row.present as number)++;
        else if (r.status === "Absent") (row.absent as number)++;
        else if (r.status === "OnLeave") (row.leave as number)++;
        else if (r.status === "HalfDay") (row.halfDay as number)++;
        else if (r.status === "WFH") (row.wfh as number)++;
        else if (r.status === "WeekOff") (row.weekOff as number)++;
        else if (r.status === "Holiday") (row.holiday as number)++;
        map.set(k, row);
      }
      return {
        title: "Monthly Attendance Summary",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "department", label: "Department", width: 16 },
          { key: "present", label: "Present", width: 10 },
          { key: "absent", label: "Absent", width: 10 },
          { key: "leave", label: "On Leave", width: 10 },
          { key: "halfDay", label: "Half Day", width: 10 },
          { key: "wfh", label: "WFH", width: 8 },
          { key: "weekOff", label: "Week Off", width: 10 },
          { key: "holiday", label: "Holiday", width: 10 },
        ],
        rows: [...map.values()],
      };
    },
  },
  {
    key: "late-early",
    label: "Late-Coming / Early-Going",
    description: "Records flagged as late check-in or early check-out, with minutes.",
    category: "Attendance",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const recs = await prisma.attendanceRecord.findMany({
        where: { orgId, deletedAt: null, ...attRange(dateFrom, dateTo), OR: [{ isLateCheckIn: true }, { isEarlyCheckOut: true }] },
        include: { employee: { select: empSelect } },
        orderBy: { date: "desc" },
        take: 10000,
      });
      return {
        title: "Late-Coming / Early-Going",
        columns: [
          { key: "date", label: "Date", width: 12 },
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "checkIn", label: "Check In", width: 10 },
          { key: "checkOut", label: "Check Out", width: 10 },
          { key: "lateBy", label: "Late (min)", width: 10 },
          { key: "earlyBy", label: "Early (min)", width: 10 },
        ],
        rows: recs.map((r) => ({
          date: fmtDate(r.date), code: r.employee?.employeeCode ?? "", name: fullName(r.employee),
          checkIn: fmtTime(r.checkIn), checkOut: fmtTime(r.checkOut), lateBy: r.lateByMinutes, earlyBy: r.earlyByMinutes,
        })),
      };
    },
  },
  {
    key: "overtime",
    label: "Overtime Report",
    description: "Records with overtime hours logged.",
    category: "Attendance",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const recs = await prisma.attendanceRecord.findMany({
        where: { orgId, deletedAt: null, ...attRange(dateFrom, dateTo), overtime: { gt: 0 } },
        include: { employee: { select: empSelect } },
        orderBy: { date: "desc" },
        take: 10000,
      });
      const map = new Map<string, { code: string; name: string; days: number; hours: number }>();
      for (const r of recs) {
        const row = map.get(r.employeeId) ?? { code: r.employee?.employeeCode ?? "", name: fullName(r.employee), days: 0, hours: 0 };
        row.days++; row.hours += num(r.overtime);
        map.set(r.employeeId, row);
      }
      return {
        title: "Overtime Report",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 24 },
          { key: "days", label: "OT Days", width: 10 },
          { key: "hours", label: "Total OT Hours", width: 14 },
        ],
        rows: [...map.values()].map((v) => ({ ...v, hours: Math.round(v.hours * 100) / 100 })),
      };
    },
  },
  {
    key: "absenteeism",
    label: "Absenteeism Report",
    description: "Absent-day count and rate per employee over the period.",
    category: "Attendance",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const recs = await prisma.attendanceRecord.findMany({
        where: { orgId, deletedAt: null, ...attRange(dateFrom, dateTo) },
        include: { employee: { select: empSelect } },
        take: 50000,
      });
      const map = new Map<string, { code: string; name: string; absent: number; marked: number }>();
      for (const r of recs) {
        const row = map.get(r.employeeId) ?? { code: r.employee?.employeeCode ?? "", name: fullName(r.employee), absent: 0, marked: 0 };
        if (r.status !== "NotMarked") row.marked++;
        if (r.status === "Absent") row.absent++;
        map.set(r.employeeId, row);
      }
      return {
        title: "Absenteeism Report",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 24 },
          { key: "absent", label: "Absent Days", width: 12 },
          { key: "marked", label: "Days Marked", width: 12 },
          { key: "rate", label: "Absence %", width: 10 },
        ],
        rows: [...map.values()].filter((v) => v.absent > 0).map((v) => ({ code: v.code, name: v.name, absent: v.absent, marked: v.marked, rate: v.marked ? Math.round((v.absent / v.marked) * 100) : 0 })),
      };
    },
  },
  {
    key: "regularization",
    label: "Regularization Report",
    description: "Attendance regularization requests with status and reason.",
    category: "Attendance",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const recs = await prisma.attendanceRecord.findMany({
        where: { orgId, deletedAt: null, ...attRange(dateFrom, dateTo), regularizationStatus: { not: "None" } },
        include: { employee: { select: empSelect } },
        orderBy: { date: "desc" },
        take: 10000,
      });
      return {
        title: "Regularization Report",
        columns: [
          { key: "date", label: "Date", width: 12 },
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "status", label: "Attendance", width: 12 },
          { key: "regStatus", label: "Regularization", width: 14 },
          { key: "reason", label: "Reason", width: 30 },
        ],
        rows: recs.map((r) => ({ date: fmtDate(r.date), code: r.employee?.employeeCode ?? "", name: fullName(r.employee), status: r.status, regStatus: r.regularizationStatus, reason: r.regularizationReason ?? "" })),
      };
    },
  },
  {
    key: "shift-assignment",
    label: "Shift Assignment",
    description: "Which shift each employee is assigned to, with timings.",
    category: "Attendance",
    async run({ orgId }) {
      const asg = await prisma.shiftAssignment.findMany({
        where: { orgId, deletedAt: null },
        include: { employee: { select: empSelect }, shift: { select: { name: true, code: true, startTime: true, endTime: true, isNightShift: true } } },
        orderBy: { effectiveFrom: "desc" },
      });
      return {
        title: "Shift Assignment",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "department", label: "Department", width: 16 },
          { key: "shift", label: "Shift", width: 16 },
          { key: "startTime", label: "Start", width: 8 },
          { key: "endTime", label: "End", width: 8 },
          { key: "night", label: "Night Shift", width: 10 },
          { key: "effectiveFrom", label: "Effective From", width: 14 },
          { key: "effectiveTo", label: "Effective To", width: 14 },
          { key: "rotating", label: "Rotating", width: 10 },
        ],
        rows: asg.map((a) => ({
          code: a.employee?.employeeCode ?? "", name: fullName(a.employee), department: a.employee?.department?.name ?? "",
          shift: `${a.shift?.name ?? ""} (${a.shift?.code ?? ""})`, startTime: a.shift?.startTime ?? "", endTime: a.shift?.endTime ?? "",
          night: a.shift?.isNightShift ? "Yes" : "No", effectiveFrom: fmtDate(a.effectiveFrom), effectiveTo: fmtDate(a.effectiveTo), rotating: a.isRotating ? "Yes" : "No",
        })),
      };
    },
  },
  {
    key: "muster-roll",
    label: "Muster Roll",
    description: "Consolidated monthly attendance (payable days) per employee for compliance.",
    category: "Attendance",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const recs = await prisma.attendanceRecord.findMany({
        where: { orgId, deletedAt: null, ...attRange(dateFrom, dateTo) },
        include: { employee: { select: empSelect } },
        take: 50000,
      });
      const map = new Map<string, Record<string, number | string>>();
      for (const r of recs) {
        const row = (map.get(r.employeeId) ?? { code: r.employee?.employeeCode ?? "", name: fullName(r.employee), present: 0, leave: 0, absent: 0, weekOff: 0, holiday: 0, payable: 0 }) as Record<string, number | string>;
        const paid = ["Present", "OnDuty", "WFH", "HalfDay", "OnLeave", "WeekOff", "Holiday", "CompOff"].includes(r.status);
        if (r.status === "Present" || r.status === "OnDuty" || r.status === "WFH") (row.present as number)++;
        else if (r.status === "OnLeave") (row.leave as number)++;
        else if (r.status === "Absent") (row.absent as number)++;
        else if (r.status === "WeekOff") (row.weekOff as number)++;
        else if (r.status === "Holiday") (row.holiday as number)++;
        if (paid) (row.payable as number) += r.status === "HalfDay" ? 0.5 : 1;
        map.set(r.employeeId, row);
      }
      return {
        title: "Muster Roll",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 24 },
          { key: "present", label: "Present", width: 10 },
          { key: "leave", label: "Leave", width: 10 },
          { key: "absent", label: "Absent", width: 10 },
          { key: "weekOff", label: "Week Off", width: 10 },
          { key: "holiday", label: "Holiday", width: 10 },
          { key: "payable", label: "Payable Days", width: 12 },
        ],
        rows: [...map.values()],
      };
    },
  },
];
