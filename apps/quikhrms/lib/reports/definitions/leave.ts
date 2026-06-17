import { prisma } from "@/lib/prisma";
import type { ReportDefinition } from "../types";
import { fmtDate, fullName, num, dateRange } from "../format";

const empSelect = { employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } } as const;
const available = (b: { opening: unknown; accrued: unknown; adjusted: unknown; carriedForward: unknown; taken: unknown; encashed: unknown; lapsed: unknown }) =>
  num(b.opening) + num(b.accrued) + num(b.adjusted) + num(b.carriedForward) - num(b.taken) - num(b.encashed) - num(b.lapsed);

export const leaveReports: ReportDefinition[] = [
  {
    key: "leave-balance",
    label: "Leave Balance",
    description: "Opening, accrued, taken and available balance per leave type (current year).",
    category: "Leave",
    async run({ orgId }) {
      const year = new Date().getFullYear();
      const bals = await prisma.leaveBalance.findMany({
        where: { orgId, deletedAt: null, year },
        include: { employee: { select: empSelect }, leaveType: { select: { name: true, code: true } } },
        orderBy: { employeeId: "asc" },
      });
      return {
        title: `Leave Balance (${year})`,
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "leaveType", label: "Leave Type", width: 16 },
          { key: "opening", label: "Opening", width: 10 },
          { key: "accrued", label: "Accrued", width: 10 },
          { key: "taken", label: "Taken", width: 10 },
          { key: "adjusted", label: "Adjusted", width: 10 },
          { key: "carriedForward", label: "Carried Fwd", width: 12 },
          { key: "available", label: "Available", width: 10 },
        ],
        rows: bals.map((b) => ({
          code: b.employee?.employeeCode ?? "", name: fullName(b.employee), leaveType: b.leaveType?.name ?? "",
          opening: num(b.opening), accrued: num(b.accrued), taken: num(b.taken), adjusted: num(b.adjusted),
          carriedForward: num(b.carriedForward), available: Math.max(0, available(b)),
        })),
      };
    },
  },
  {
    key: "leave-transactions",
    label: "Leave Transactions",
    description: "Leave requests with type, dates, duration and status for the period.",
    category: "Leave",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const reqs = await prisma.leaveRequest.findMany({
        where: { orgId, deletedAt: null, ...dateRange("startDate", dateFrom, dateTo) },
        include: { employee: { select: empSelect }, leaveType: { select: { name: true } } },
        orderBy: { startDate: "desc" },
        take: 10000,
      });
      return {
        title: "Leave Transactions",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "leaveType", label: "Leave Type", width: 16 },
          { key: "startDate", label: "From", width: 12 },
          { key: "endDate", label: "To", width: 12 },
          { key: "duration", label: "Days", width: 8 },
          { key: "status", label: "Status", width: 12 },
          { key: "appliedOn", label: "Applied On", width: 12 },
          { key: "reason", label: "Reason", width: 28 },
        ],
        rows: reqs.map((r) => ({
          code: r.employee?.employeeCode ?? "", name: fullName(r.employee), leaveType: r.leaveType?.name ?? "",
          startDate: fmtDate(r.startDate), endDate: fmtDate(r.endDate), duration: num(r.duration), status: r.status,
          appliedOn: fmtDate(r.appliedOn), reason: r.reason ?? "",
        })),
      };
    },
  },
  {
    key: "leave-liability",
    label: "Leave Liability / Encashment",
    description: "Encashable leave balance and estimated monetary value (approx, monthly CTC ÷ 30).",
    category: "Leave",
    async run({ orgId }) {
      const year = new Date().getFullYear();
      const today = new Date();
      const [bals, sals] = await Promise.all([
        prisma.leaveBalance.findMany({ where: { orgId, deletedAt: null, year, leaveType: { isEncashable: true } }, include: { employee: { select: empSelect } } }),
        prisma.employeeSalary.findMany({ where: { orgId, isActive: true, deletedAt: null, effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] }, select: { employeeId: true, ctc: true } }),
      ]);
      const ctcOf = new Map(sals.map((s) => [s.employeeId, num(s.ctc)]));
      const map = new Map<string, { code: string; name: string; days: number }>();
      for (const b of bals) {
        const row = map.get(b.employeeId) ?? { code: b.employee?.employeeCode ?? "", name: fullName(b.employee), days: 0 };
        row.days += Math.max(0, available(b));
        map.set(b.employeeId, row);
      }
      return {
        title: "Leave Liability / Encashment",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 24 },
          { key: "days", label: "Encashable Days", width: 14 },
          { key: "perDay", label: "Per-Day Value", width: 14, money: true },
          { key: "liability", label: "Est. Liability", width: 16, money: true },
        ],
        rows: [...map.entries()].map(([id, v]) => {
          const perDay = Math.round((ctcOf.get(id) ?? 0) / 12 / 30);
          return { code: v.code, name: v.name, days: Math.round(v.days * 10) / 10, perDay, liability: Math.round(perDay * v.days) };
        }).filter((r) => r.days > 0),
      };
    },
  },
  {
    key: "pending-leave-approvals",
    label: "Pending Leave Approvals",
    description: "Leave requests awaiting approval, with how long they've been pending.",
    category: "Leave",
    async run({ orgId }) {
      const reqs = await prisma.leaveRequest.findMany({
        where: { orgId, deletedAt: null, status: "Pending" },
        include: { employee: { select: empSelect }, leaveType: { select: { name: true } } },
        orderBy: { appliedOn: "asc" },
      });
      const now = Date.now();
      return {
        title: "Pending Leave Approvals",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "leaveType", label: "Leave Type", width: 16 },
          { key: "startDate", label: "From", width: 12 },
          { key: "endDate", label: "To", width: 12 },
          { key: "duration", label: "Days", width: 8 },
          { key: "appliedOn", label: "Applied On", width: 12 },
          { key: "ageDays", label: "Pending (days)", width: 12 },
        ],
        rows: reqs.map((r) => ({
          code: r.employee?.employeeCode ?? "", name: fullName(r.employee), leaveType: r.leaveType?.name ?? "",
          startDate: fmtDate(r.startDate), endDate: fmtDate(r.endDate), duration: num(r.duration), appliedOn: fmtDate(r.appliedOn),
          ageDays: Math.floor((now - r.appliedOn.getTime()) / 86_400_000),
        })),
      };
    },
  },
  {
    key: "leave-type-utilization",
    label: "Leave Type Utilization",
    description: "Approved leave volume by leave type for the period.",
    category: "Leave",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const reqs = await prisma.leaveRequest.findMany({
        where: { orgId, deletedAt: null, status: "Approved", ...dateRange("startDate", dateFrom, dateTo) },
        include: { leaveType: { select: { name: true } } },
      });
      const map = new Map<string, { requests: number; days: number }>();
      for (const r of reqs) {
        const k = r.leaveType?.name ?? "(Unknown)";
        const row = map.get(k) ?? { requests: 0, days: 0 };
        row.requests++; row.days += num(r.duration);
        map.set(k, row);
      }
      return {
        title: "Leave Type Utilization",
        columns: [
          { key: "leaveType", label: "Leave Type", width: 22 },
          { key: "requests", label: "Requests", width: 12 },
          { key: "days", label: "Total Days", width: 12 },
        ],
        rows: [...map.entries()].sort((a, b) => b[1].days - a[1].days).map(([leaveType, v]) => ({ leaveType, requests: v.requests, days: Math.round(v.days * 10) / 10 })),
      };
    },
  },
  {
    key: "holiday-calendar",
    label: "Holiday Calendar",
    description: "Holidays with type and floater flag.",
    category: "Leave",
    async run({ orgId }) {
      const hols = await prisma.companyHoliday.findMany({
        where: { orgId, deletedAt: null },
        orderBy: { date: "asc" },
      });
      return {
        title: "Holiday Calendar",
        columns: [
          { key: "date", label: "Date", width: 12 },
          { key: "name", label: "Holiday", width: 28 },
          { key: "type", label: "Type", width: 14 },
          { key: "optional", label: "Optional", width: 10 },
        ],
        rows: hols.map((h) => ({ date: fmtDate(h.date), name: h.name, type: h.type, optional: h.isOptional ? "Yes" : "No" })),
      };
    },
  },
  {
    key: "wfh-report",
    label: "Work From Home",
    description: "WFH requests with dates, days and status for the period.",
    category: "Leave",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const reqs = await prisma.wfhRequest.findMany({
        where: { orgId, deletedAt: null, ...dateRange("startDate", dateFrom, dateTo) },
        include: { employee: { select: empSelect } },
        orderBy: { startDate: "desc" },
        take: 10000,
      });
      return {
        title: "Work From Home",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "startDate", label: "From", width: 12 },
          { key: "endDate", label: "To", width: 12 },
          { key: "days", label: "Days", width: 8 },
          { key: "session", label: "Session", width: 12 },
          { key: "status", label: "Status", width: 12 },
          { key: "reason", label: "Reason", width: 28 },
        ],
        rows: reqs.map((r) => ({
          code: r.employee?.employeeCode ?? "", name: fullName(r.employee), startDate: fmtDate(r.startDate), endDate: fmtDate(r.endDate),
          days: num(r.days), session: r.session, status: r.status, reason: r.reason ?? "",
        })),
      };
    },
  },
];
