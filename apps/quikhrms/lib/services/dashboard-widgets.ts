import { prisma } from "@/lib/prisma";

// Single source of truth for widget types. The `WidgetType` union, the
// API allow-list, and any UI catalog all derive from this — add a new widget
// here once and it's valid everywhere. (Previously the union and the
// widget-data route's allow-list were maintained separately and drifted.)
const WIDGET_TYPES = [
  "headcount-trend",
  "turnover-rate",
  "attrition-rate",
  "new-hires",
  "terminations",
  "headcount-by-department",
  "headcount-by-gender",
  "headcount-by-location",
  "tenure-distribution",
  "age-distribution",
  "open-positions",
  "time-to-hire",
  "promotions-this-year",
  "internal-mobility",
  "salary-by-department",
  "ctc-spend",
  // Hiring analytics
  "pipeline-funnel",
  "aging-requisitions",
  "offer-acceptance-rate",
  "top-hiring-departments",
  "candidates-interviewed",
  "recruitment-sources",
  "top-sources-by-hires",
  "open-positions-by-department",
  "hires-count",
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

export function isWidgetType(v: string): v is WidgetType {
  return (WIDGET_TYPES as readonly string[]).includes(v);
}

const CANDIDATE_SOURCE_LABEL: Record<string, string> = {
  CandJobPortal: "Job Portal",
  CandLinkedIn: "LinkedIn",
  CandReferral: "Referral",
  CandAgency: "Agency",
  CandCareerPage: "Career Page",
  CandCampus: "Campus",
  CandDirect: "Direct",
  CandInbound: "Inbound",
};

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  layout?: { w: number; h: number };
  benchmark?: number; // optional reference line value (e.g. industry %)
}

interface SeriesPoint { label: string; value: number }
interface PieSlice { name: string; value: number }

export interface WidgetResult {
  type: WidgetType;
  metric?: { value: number; delta?: number; format: "number" | "percent" | "currency" };
  series?: SeriesPoint[];
  rolling?: SeriesPoint[];
  pie?: PieSlice[];
  benchmark?: number;
}

function monthsBack(n: number): { start: Date; end: Date; label: string }[] {
  const out: { start: Date; end: Date; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    out.push({ start, end, label: start.toLocaleString("en-IN", { month: "short", year: "2-digit" }) });
  }
  return out;
}

/** Current window [start, now] and the equal-length prior window [priorStart, start). */
function windows(n: number): { start: Date; priorStart: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1);
  const priorStart = new Date(now.getFullYear(), now.getMonth() - (2 * n - 1), 1);
  return { start, priorStart };
}

/** Percentage change current vs prior. Null when prior is 0 (avoid ÷0 / infinity). */
function pctDelta(current: number, prior: number): number | undefined {
  if (prior === 0) return undefined;
  return Math.round(((current - prior) / prior) * 100);
}

export async function computeWidget(
  orgId: string,
  type: WidgetType,
  monthsRange = 12,
): Promise<WidgetResult> {
  switch (type) {
    case "headcount-trend": {
      const months = monthsBack(monthsRange);
      const rangeStart = months[0].start;
      const rangeEnd = months[months.length - 1].end;
      // Single query: anyone who could possibly be active in the range.
      const employees = await prisma.employee.findMany({
        where: {
          orgId,
          deletedAt: null,
          dateOfJoining: { lte: rangeEnd },
          OR: [{ lastWorkingDate: null }, { lastWorkingDate: { gte: rangeStart } }],
        },
        select: { dateOfJoining: true, lastWorkingDate: true },
      });
      const series: SeriesPoint[] = months.map((m) => {
        const value = employees.reduce((acc, e) => {
          if (e.dateOfJoining > m.end) return acc;
          if (e.lastWorkingDate && e.lastWorkingDate <= m.end) return acc;
          return acc + 1;
        }, 0);
        return { label: m.label, value };
      });
      const last = series[series.length - 1]?.value ?? 0;
      const prev = series[series.length - 13]?.value ?? series[0]?.value ?? 0;
      return { type, series, metric: { value: last, delta: last - prev, format: "number" } };
    }
    case "turnover-rate":
    case "attrition-rate": {
      const months = monthsBack(monthsRange);
      const rangeStart = months[0].start;
      const rangeEnd = months[months.length - 1].end;
      // One query: any employee active during or exited within the range.
      const employees = await prisma.employee.findMany({
        where: {
          orgId,
          deletedAt: null,
          dateOfJoining: { lte: rangeEnd },
          OR: [{ lastWorkingDate: null }, { lastWorkingDate: { gte: rangeStart } }],
        },
        select: { dateOfJoining: true, lastWorkingDate: true },
      });
      const series: SeriesPoint[] = [];
      const rolling: SeriesPoint[] = [];
      const allMonthlyExits: number[] = [];
      for (const m of months) {
        let exits = 0;
        let headcount = 0;
        for (const e of employees) {
          if (e.lastWorkingDate && e.lastWorkingDate >= m.start && e.lastWorkingDate <= m.end) exits++;
          if (e.dateOfJoining <= m.start && (!e.lastWorkingDate || e.lastWorkingDate >= m.start)) headcount++;
        }
        const rate = headcount > 0 ? (exits / headcount) * 100 : 0;
        series.push({ label: m.label, value: Math.round(rate * 10) / 10 });
        allMonthlyExits.push(exits);
        const window = allMonthlyExits.slice(-12);
        const totalExits = window.reduce((a, b) => a + b, 0);
        const annualizedRate = headcount > 0 ? (totalExits / headcount) * 100 * (12 / Math.min(window.length, 12)) : 0;
        rolling.push({ label: m.label, value: Math.round(annualizedRate * 10) / 10 });
      }
      return {
        type,
        series, rolling,
        metric: { value: rolling[rolling.length - 1]?.value ?? 0, format: "percent" },
        benchmark: type === "turnover-rate" ? 1.5 : 1.0,
      };
    }
    case "new-hires": {
      const months = monthsBack(monthsRange);
      const rangeStart = months[0].start;
      const rangeEnd = months[months.length - 1].end;
      const employees = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, dateOfJoining: { gte: rangeStart, lte: rangeEnd } },
        select: { dateOfJoining: true },
      });
      const series: SeriesPoint[] = months.map((m) => ({
        label: m.label,
        value: employees.reduce((acc, e) => (e.dateOfJoining >= m.start && e.dateOfJoining <= m.end ? acc + 1 : acc), 0),
      }));
      const total = series.reduce((s, p) => s + p.value, 0);
      return { type, series, metric: { value: total, format: "number" } };
    }
    case "terminations": {
      const months = monthsBack(monthsRange);
      const rangeStart = months[0].start;
      const rangeEnd = months[months.length - 1].end;
      const employees = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, lastWorkingDate: { gte: rangeStart, lte: rangeEnd } },
        select: { lastWorkingDate: true },
      });
      const series: SeriesPoint[] = months.map((m) => ({
        label: m.label,
        value: employees.reduce((acc, e) => (e.lastWorkingDate && e.lastWorkingDate >= m.start && e.lastWorkingDate <= m.end ? acc + 1 : acc), 0),
      }));
      const total = series.reduce((s, p) => s + p.value, 0);
      return { type, series, metric: { value: total, format: "number" } };
    }
    case "headcount-by-department": {
      const grouped = await prisma.employee.groupBy({
        by: ["departmentId"],
        where: { orgId, deletedAt: null, status: "Active" },
        _count: true,
      });
      const ids = grouped.map((g) => g.departmentId).filter((x): x is string => !!x);
      const depts = ids.length === 0 ? [] : await prisma.department.findMany({
        where: { orgId, deletedAt: null, id: { in: ids } },
        select: { id: true, name: true },
      });
      const map = new Map(depts.map((d) => [d.id, d.name]));
      const pie: PieSlice[] = grouped.map((g) => ({
        name: g.departmentId ? (map.get(g.departmentId) ?? "Unknown") : "Unassigned",
        value: g._count,
      })).sort((a, b) => b.value - a.value);
      return { type, pie };
    }
    case "headcount-by-gender": {
      const grouped = await prisma.employee.groupBy({
        by: ["gender"],
        where: { orgId, deletedAt: null, status: "Active" },
        _count: true,
      });
      const pie = grouped.map((g) => ({ name: g.gender ?? "Unspecified", value: g._count }));
      return { type, pie };
    }
    case "headcount-by-location": {
      const grouped = await prisma.employee.groupBy({
        by: ["officeLocationId"],
        where: { orgId, deletedAt: null, status: "Active" },
        _count: true,
      });
      const ids = grouped.map((g) => g.officeLocationId).filter((x): x is string => !!x);
      const locs = ids.length === 0 ? [] : await prisma.officeLocation.findMany({
        where: { orgId, deletedAt: null, id: { in: ids } },
        select: { id: true, name: true },
      });
      const map = new Map(locs.map((l) => [l.id, l.name]));
      const pie = grouped.map((g) => ({
        name: g.officeLocationId ? (map.get(g.officeLocationId) ?? "Unknown") : "Remote",
        value: g._count,
      })).sort((a, b) => b.value - a.value);
      return { type, pie };
    }
    case "tenure-distribution": {
      const employees = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, status: "Active" },
        select: { dateOfJoining: true },
      });
      const buckets: Record<string, number> = { "<1 yr": 0, "1-3 yrs": 0, "3-5 yrs": 0, "5-10 yrs": 0, "10+ yrs": 0 };
      const now = Date.now();
      for (const e of employees) {
        const yrs = (now - e.dateOfJoining.getTime()) / (365.25 * 86_400_000);
        if (yrs < 1) buckets["<1 yr"]++;
        else if (yrs < 3) buckets["1-3 yrs"]++;
        else if (yrs < 5) buckets["3-5 yrs"]++;
        else if (yrs < 10) buckets["5-10 yrs"]++;
        else buckets["10+ yrs"]++;
      }
      return { type, pie: Object.entries(buckets).map(([name, value]) => ({ name, value })) };
    }
    case "age-distribution": {
      const employees = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, status: "Active", dateOfBirth: { not: null } },
        select: { dateOfBirth: true },
      });
      const buckets: Record<string, number> = { "<25": 0, "25-34": 0, "35-44": 0, "45-54": 0, "55+": 0 };
      const now = Date.now();
      for (const e of employees) {
        if (!e.dateOfBirth) continue;
        const yrs = (now - e.dateOfBirth.getTime()) / (365.25 * 86_400_000);
        if (yrs < 25) buckets["<25"]++;
        else if (yrs < 35) buckets["25-34"]++;
        else if (yrs < 45) buckets["35-44"]++;
        else if (yrs < 55) buckets["45-54"]++;
        else buckets["55+"]++;
      }
      return { type, pie: Object.entries(buckets).map(([name, value]) => ({ name, value })) };
    }
    case "open-positions": {
      // Only count requisitions that are actively recruiting — not drafts,
      // not closed/cancelled/on-hold/pending. Matches what every HR dashboard
      // calls "open roles" (Greenhouse, Lever, Workday).
      const open = await prisma.jobRequisition.count({
        where: {
          orgId,
          deletedAt: null,
          status: { in: ["ReqOpen", "ReqApproved"] },
        },
      });
      return { type, metric: { value: open, format: "number" } };
    }
    case "time-to-hire": {
      // Real time-to-hire = days from application created → application status
      // moved to AppHired (we use updatedAt because that's when the status
      // last changed for a Hired row). Capped to the requested window so older
      // hires don't skew the average. Delta = vs the prior equal window.
      const { start, priorStart } = windows(monthsRange);
      const all = await prisma.jobApplication.findMany({
        where: { orgId, deletedAt: null, status: "AppHired", updatedAt: { gte: priorStart } },
        select: { createdAt: true, updatedAt: true },
      });
      const avgDays = (rows: typeof all) =>
        rows.length === 0 ? 0 : Math.round(
          rows.reduce((s, a) => s + (a.updatedAt.getTime() - a.createdAt.getTime()), 0) / rows.length / 86_400_000,
        );
      const current = all.filter((a) => a.updatedAt >= start);
      const prior = all.filter((a) => a.updatedAt < start);
      const days = avgDays(current);
      return { type, metric: { value: days, delta: pctDelta(days, avgDays(prior)), format: "number" } };
    }
    case "hires-count": {
      // Total hires in the window + delta vs prior equal window.
      const { start, priorStart } = windows(monthsRange);
      const hires = await prisma.jobApplication.findMany({
        where: { orgId, deletedAt: null, status: "AppHired", updatedAt: { gte: priorStart } },
        select: { updatedAt: true },
      });
      const current = hires.filter((h) => h.updatedAt >= start).length;
      const prior = hires.filter((h) => h.updatedAt < start).length;
      return { type, metric: { value: current, delta: pctDelta(current, prior), format: "number" } };
    }
    case "pipeline-funnel": {
      // Live applications grouped by their pipeline stage. Active = anything
      // not in a terminal status (hired / rejected / declined / withdrawn).
      const apps = await prisma.jobApplication.findMany({
        where: {
          orgId,
          deletedAt: null,
          status: { in: ["AppActive", "AppOffered", "AppOnHold"] },
        },
        select: { currentStage: true, status: true },
      });
      const counts = new Map<string, number>();
      for (const a of apps) {
        // Prefer the explicit stage label; fall back to status when stage isn't set
        // (older rows or fresh applications that haven't moved yet).
        const key = a.currentStage?.trim() || (a.status === "AppOffered" ? "Offer" : "New");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      // Stable, intuitive order — known stages first, custom stages after.
      const STAGE_ORDER = ["New", "Sourced", "Screening", "Phone Screen", "Interview", "Onsite", "Offer", "Background Check"];
      const sorted = [...counts.entries()].sort(([a], [b]) => {
        const ai = STAGE_ORDER.indexOf(a);
        const bi = STAGE_ORDER.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
      });
      return { type, pie: sorted.map(([name, value]) => ({ name, value })) };
    }
    case "aging-requisitions": {
      // Open reqs bucketed by how long they've been open. Anything 60+ days
      // is a yellow/red flag in most hiring teams.
      const open = await prisma.jobRequisition.findMany({
        where: {
          orgId,
          deletedAt: null,
          status: { in: ["ReqOpen", "ReqApproved"] },
        },
        select: { createdAt: true },
      });
      const buckets: Record<string, number> = {
        "0-30 days": 0, "30-60 days": 0, "60-90 days": 0, "90+ days": 0,
      };
      const now = Date.now();
      for (const r of open) {
        const days = (now - r.createdAt.getTime()) / 86_400_000;
        if (days < 30) buckets["0-30 days"]++;
        else if (days < 60) buckets["30-60 days"]++;
        else if (days < 90) buckets["60-90 days"]++;
        else buckets["90+ days"]++;
      }
      return { type, pie: Object.entries(buckets).map(([name, value]) => ({ name, value })) };
    }
    case "offer-acceptance-rate": {
      // % of sent offers in the window that were accepted, + delta vs prior.
      // OfferDraft / OfferPendingApproval / OfferApproved are excluded — they
      // haven't reached the candidate yet so acceptance can't be measured.
      const { start, priorStart } = windows(monthsRange);
      const offers = await prisma.jobApplication.findMany({
        where: { orgId, offerSentAt: { not: null, gte: priorStart } },
        select: { offerStatus: true, offerSentAt: true },
      });
      const rateOf = (rows: typeof offers) => {
        if (rows.length === 0) return 0;
        const accepted = rows.filter((o) => o.offerStatus === "OfferAccepted").length;
        return Math.round((accepted / rows.length) * 1000) / 10;
      };
      const current = rateOf(offers.filter((o) => o.offerSentAt! >= start));
      const prior = rateOf(offers.filter((o) => o.offerSentAt! < start));
      return { type, metric: { value: current, delta: pctDelta(current, prior), format: "percent" } };
    }
    case "top-hiring-departments": {
      // Departments ranked by hires (AppHired apps) in the window. Shows
      // which teams are actually filling roles vs which are bottlenecking.
      const months = monthsBack(monthsRange);
      const rangeStart = months[0].start;
      const hires = await prisma.jobApplication.findMany({
        where: {
          orgId,
          deletedAt: null,
          status: "AppHired",
          updatedAt: { gte: rangeStart },
        },
        select: { requisition: { select: { departmentId: true } } },
      });
      const counts = new Map<string | null, number>();
      for (const h of hires) {
        const did = h.requisition?.departmentId ?? null;
        counts.set(did, (counts.get(did) ?? 0) + 1);
      }
      const ids = [...counts.keys()].filter((x): x is string => !!x);
      const depts = ids.length === 0 ? [] : await prisma.department.findMany({
        where: { orgId, deletedAt: null, id: { in: ids } },
        select: { id: true, name: true },
      });
      const dmap = new Map(depts.map((d) => [d.id, d.name]));
      const pie = [...counts.entries()]
        .map(([id, value]) => ({ name: id ? (dmap.get(id) ?? "Unknown") : "Unassigned", value }))
        .sort((a, b) => b.value - a.value);
      return { type, pie };
    }
    case "promotions-this-year": {
      const start = new Date(new Date().getFullYear(), 0, 1);
      const promos = await prisma.employmentHistory.count({
        where: { orgId, changeType: "Promotion", effectiveDate: { gte: start } },
      });
      return { type, metric: { value: promos, format: "number" } };
    }
    case "internal-mobility": {
      const start = new Date(new Date().getFullYear(), 0, 1);
      const moves = await prisma.employmentHistory.count({
        where: { orgId, changeType: { in: ["Transfer", "Promotion"] }, effectiveDate: { gte: start } },
      });
      return { type, metric: { value: moves, format: "number" } };
    }
    case "salary-by-department": {
      const [salaries, depts] = await Promise.all([
        prisma.employeeSalary.findMany({
          where: { orgId, deletedAt: null, isActive: true },
          select: { employeeId: true, ctc: true },
        }),
        prisma.department.findMany({
          where: { orgId, deletedAt: null },
          select: { id: true, name: true },
        }),
      ]);
      const empIds = salaries.map((s) => s.employeeId);
      const employees = empIds.length === 0 ? [] : await prisma.employee.findMany({
        where: { orgId, id: { in: empIds }, deletedAt: null },
        select: { id: true, departmentId: true },
      });
      const deptMap = new Map(depts.map((d) => [d.id, d.name]));
      const empMap = new Map(employees.map((e) => [e.id, e.departmentId]));
      const totals = new Map<string, number>();
      for (const s of salaries) {
        const deptId = empMap.get(s.employeeId);
        const name = deptId ? (deptMap.get(deptId) ?? "Unknown") : "Unassigned";
        totals.set(name, (totals.get(name) ?? 0) + Number(s.ctc));
      }
      const pie = [...totals.entries()].map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
      return { type, pie };
    }
    case "ctc-spend": {
      const salaries = await prisma.employeeSalary.findMany({
        where: { orgId, deletedAt: null, isActive: true },
        select: { ctc: true },
      });
      const total = salaries.reduce((s, x) => s + Number(x.ctc), 0);
      return { type, metric: { value: Math.round(total), format: "currency" } };
    }
    case "candidates-interviewed": {
      // Distinct candidates who had ≥1 interview scheduled in the window + delta.
      const { start, priorStart } = windows(monthsRange);
      const interviews = await prisma.interview.findMany({
        where: { orgId, scheduledAt: { gte: priorStart } },
        select: { scheduledAt: true, application: { select: { candidateId: true } } },
      });
      const distinctIn = (from: Date, to?: Date) =>
        new Set(
          interviews
            .filter((i) => i.scheduledAt >= from && (!to || i.scheduledAt < to))
            .map((i) => i.application?.candidateId)
            .filter(Boolean),
        ).size;
      const current = distinctIn(start);
      const prior = distinctIn(priorStart, start);
      return { type, metric: { value: current, delta: pctDelta(current, prior), format: "number" } };
    }
    case "recruitment-sources": {
      // Distinct sources that produced a hire in the window + delta.
      const { start, priorStart } = windows(monthsRange);
      const hires = await prisma.jobApplication.findMany({
        where: { orgId, deletedAt: null, status: "AppHired", updatedAt: { gte: priorStart } },
        select: { updatedAt: true, candidate: { select: { source: true } } },
      });
      const sourcesIn = (from: Date, to?: Date) =>
        new Set(
          hires
            .filter((h) => h.updatedAt >= from && (!to || h.updatedAt < to))
            .map((h) => h.candidate?.source)
            .filter(Boolean),
        ).size;
      const current = sourcesIn(start);
      const prior = sourcesIn(priorStart, start);
      return { type, metric: { value: current, delta: pctDelta(current, prior), format: "number" } };
    }
    case "open-positions-by-department": {
      // Open requisitions grouped by department (donut).
      const reqs = await prisma.jobRequisition.findMany({
        where: { orgId, deletedAt: null, status: { in: ["ReqOpen", "ReqApproved"] } },
        select: { departmentId: true, positions: true },
      });
      const counts = new Map<string | null, number>();
      for (const r of reqs) {
        // Count open seats (positions), not just requisition rows.
        counts.set(r.departmentId, (counts.get(r.departmentId) ?? 0) + (r.positions ?? 1));
      }
      const ids = [...counts.keys()].filter((x): x is string => !!x);
      const depts = ids.length === 0 ? [] : await prisma.department.findMany({
        where: { orgId, deletedAt: null, id: { in: ids } },
        select: { id: true, name: true },
      });
      const dmap = new Map(depts.map((dp) => [dp.id, dp.name]));
      const pie = [...counts.entries()]
        .map(([dId, value]) => ({ name: dId ? (dmap.get(dId) ?? "Unknown") : "Unassigned", value }))
        .sort((a, b) => b.value - a.value);
      return { type, pie };
    }
    case "top-sources-by-hires": {
      // Hires grouped by candidate source, ranked.
      const months = monthsBack(monthsRange);
      const rangeStart = months[0].start;
      const hires = await prisma.jobApplication.findMany({
        where: { orgId, deletedAt: null, status: "AppHired", updatedAt: { gte: rangeStart } },
        select: { candidate: { select: { source: true } } },
      });
      const counts = new Map<string, number>();
      for (const h of hires) {
        const s = h.candidate?.source ?? "CandDirect";
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
      const pie = [...counts.entries()]
        .map(([s, value]) => ({ name: CANDIDATE_SOURCE_LABEL[s] ?? s, value }))
        .sort((a, b) => b.value - a.value);
      return { type, pie };
    }
    default:
      return { type, metric: { value: 0, format: "number" } };
  }
}
