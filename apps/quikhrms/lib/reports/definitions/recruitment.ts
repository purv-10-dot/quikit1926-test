import { prisma } from "@/lib/prisma";
import type { ReportDefinition } from "../types";
import { fmtDate, fullName, num } from "../format";
import { offerSelect, offerFromApplication } from "@/lib/recruit/offer-shape";

async function departmentMap(orgId: string, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  if (!unique.length) return new Map<string, string>();
  const depts = await prisma.department.findMany({ where: { orgId, id: { in: unique } }, select: { id: true, name: true } });
  return new Map(depts.map((d) => [d.id, d.name]));
}

// appId → candidate name + requisition title + appliedDate, for interview/offer reports.
async function applicationContext(orgId: string, appIds: string[]) {
  const unique = [...new Set(appIds)];
  if (!unique.length) return new Map<string, { candidate: string; requisition: string; appliedDate: Date }>();
  const apps = await prisma.jobApplication.findMany({ where: { orgId, id: { in: unique } }, select: { id: true, candidateId: true, requisitionId: true, appliedDate: true } });
  const cands = await prisma.candidate.findMany({ where: { orgId, id: { in: [...new Set(apps.map((a) => a.candidateId))] } }, select: { id: true, firstName: true, lastName: true } });
  const reqs = await prisma.jobRequisition.findMany({ where: { orgId, id: { in: [...new Set(apps.map((a) => a.requisitionId))] } }, select: { id: true, title: true } });
  const cMap = new Map(cands.map((c) => [c.id, fullName(c)]));
  const rMap = new Map(reqs.map((r) => [r.id, r.title]));
  return new Map(apps.map((a) => [a.id, { candidate: cMap.get(a.candidateId) ?? "", requisition: rMap.get(a.requisitionId) ?? "", appliedDate: a.appliedDate }]));
}

export const recruitmentReports: ReportDefinition[] = [
  {
    key: "open-positions",
    label: "Open Positions / Requisitions",
    description: "Job requisitions with positions, fill progress, status and priority.",
    category: "Recruitment",
    async run({ orgId }) {
      const reqs = await prisma.jobRequisition.findMany({ where: { orgId, deletedAt: null }, orderBy: { createdAt: "desc" } });
      const depts = await departmentMap(orgId, reqs.map((r) => r.departmentId));
      return {
        title: "Open Positions / Requisitions",
        columns: [
          { key: "reqNumber", label: "Req #", width: 14 },
          { key: "title", label: "Title", width: 24 },
          { key: "department", label: "Department", width: 18 },
          { key: "positions", label: "Positions", width: 10 },
          { key: "filled", label: "Filled", width: 8 },
          { key: "status", label: "Status", width: 14 },
          { key: "priority", label: "Priority", width: 10 },
          { key: "closedDate", label: "Closed", width: 12 },
        ],
        rows: reqs.map((r) => ({
          reqNumber: r.requisitionNumber, title: r.title, department: r.departmentId ? depts.get(r.departmentId) ?? "" : "",
          positions: r.positions, filled: r.filledPositions, status: r.status, priority: r.priority, closedDate: fmtDate(r.closedDate),
        })),
      };
    },
  },
  {
    key: "recruitment-funnel",
    label: "Recruitment Funnel",
    description: "Application counts by status across all requisitions.",
    category: "Recruitment",
    async run({ orgId }) {
      const apps = await prisma.jobApplication.findMany({ where: { orgId, deletedAt: null }, select: { status: true, currentStage: true } });
      const map = new Map<string, number>();
      for (const a of apps) {
        const k = a.status;
        map.set(k, (map.get(k) ?? 0) + 1);
      }
      return {
        title: "Recruitment Funnel",
        columns: [
          { key: "status", label: "Application Status", width: 24 },
          { key: "count", label: "Applications", width: 14 },
        ],
        rows: [...map.entries()].sort((a, b) => b[1] - a[1]).map(([status, count]) => ({ status, count })),
      };
    },
  },
  {
    key: "time-to-hire",
    label: "Time-to-Hire",
    description: "Days from application to offer acceptance, per accepted offer.",
    category: "Recruitment",
    async run({ orgId }) {
      const offerApps = await prisma.jobApplication.findMany({
        where: { orgId, deletedAt: null, offerStatus: "OfferAccepted", offerRespondedAt: { not: null } },
        select: { id: true, offerRespondedAt: true, offeredCTC: true, offerJoiningDate: true },
      });
      const offers = offerApps.map((a) => ({ applicationId: a.id, respondedAt: a.offerRespondedAt, offeredCTC: a.offeredCTC, joiningDate: a.offerJoiningDate }));
      const ctx = await applicationContext(orgId, offers.map((o) => o.applicationId));
      return {
        title: "Time-to-Hire",
        columns: [
          { key: "candidate", label: "Candidate", width: 22 },
          { key: "requisition", label: "Requisition", width: 24 },
          { key: "appliedDate", label: "Applied", width: 12 },
          { key: "acceptedDate", label: "Accepted", width: 12 },
          { key: "days", label: "Days to Hire", width: 12 },
          { key: "offeredCTC", label: "Offered CTC", width: 14, money: true },
        ],
        rows: offers.map((o) => {
          const c = ctx.get(o.applicationId);
          const days = c && o.respondedAt ? Math.round((o.respondedAt.getTime() - c.appliedDate.getTime()) / 86_400_000) : "";
          return { candidate: c?.candidate ?? "", requisition: c?.requisition ?? "", appliedDate: fmtDate(c?.appliedDate), acceptedDate: fmtDate(o.respondedAt), days, offeredCTC: num(o.offeredCTC) };
        }),
      };
    },
  },
  {
    key: "source-of-hire",
    label: "Source of Hire",
    description: "Candidate volume and hires grouped by sourcing channel.",
    category: "Recruitment",
    async run({ orgId }) {
      const cands = await prisma.candidate.findMany({ where: { orgId, deletedAt: null }, select: { source: true, status: true } });
      const map = new Map<string, { total: number; hired: number }>();
      for (const c of cands) {
        const k = c.source;
        const row = map.get(k) ?? { total: 0, hired: 0 };
        row.total++;
        if (c.status === "Hired") row.hired++;
        map.set(k, row);
      }
      return {
        title: "Source of Hire",
        columns: [
          { key: "source", label: "Source", width: 22 },
          { key: "candidates", label: "Candidates", width: 14 },
          { key: "hired", label: "Hired", width: 10 },
          { key: "conversion", label: "Conversion %", width: 14 },
        ],
        rows: [...map.entries()].sort((a, b) => b[1].total - a[1].total).map(([source, v]) => ({ source, candidates: v.total, hired: v.hired, conversion: v.total ? Math.round((v.hired / v.total) * 100) : 0 })),
      };
    },
  },
  {
    key: "interviews",
    label: "Interview Report",
    description: "Scheduled interviews with round, type, status and candidate.",
    category: "Recruitment",
    async run({ orgId }) {
      const ints = await prisma.interview.findMany({ where: { orgId, deletedAt: null }, orderBy: { scheduledAt: "desc" }, take: 10000 });
      const ctx = await applicationContext(orgId, ints.map((i) => i.applicationId));
      return {
        title: "Interview Report",
        columns: [
          { key: "candidate", label: "Candidate", width: 22 },
          { key: "requisition", label: "Requisition", width: 22 },
          { key: "round", label: "Round", width: 8 },
          { key: "type", label: "Type", width: 12 },
          { key: "scheduledAt", label: "Scheduled", width: 14 },
          { key: "status", label: "Status", width: 14 },
        ],
        rows: ints.map((i) => {
          const c = ctx.get(i.applicationId);
          return { candidate: c?.candidate ?? "", requisition: c?.requisition ?? "", round: i.round, type: i.type, scheduledAt: fmtDate(i.scheduledAt), status: i.status };
        }),
      };
    },
  },
  {
    key: "offers",
    label: "Offer Report",
    description: "Offers with CTC, joining date and acceptance status.",
    category: "Recruitment",
    async run({ orgId }) {
      const offerApps = await prisma.jobApplication.findMany({
        where: { orgId, deletedAt: null, offerStatus: { not: null } },
        orderBy: { offerCreatedAt: "desc" },
        select: offerSelect,
      });
      const offers = offerApps.map((a) => offerFromApplication(a)!);
      const ctx = await applicationContext(orgId, offers.map((o) => o.applicationId));
      return {
        title: "Offer Report",
        columns: [
          { key: "candidate", label: "Candidate", width: 22 },
          { key: "designation", label: "Designation", width: 20 },
          { key: "offeredCTC", label: "Offered CTC", width: 14, money: true },
          { key: "joiningDate", label: "Joining Date", width: 12 },
          { key: "status", label: "Status", width: 14 },
          { key: "sentAt", label: "Sent", width: 12 },
          { key: "respondedAt", label: "Responded", width: 12 },
        ],
        rows: offers.map((o) => {
          const c = ctx.get(o.applicationId);
          return { candidate: c?.candidate ?? "", designation: o.designation ?? "", offeredCTC: num(o.offeredCTC), joiningDate: fmtDate(o.joiningDate), status: o.status ?? "", sentAt: fmtDate(o.sentAt), respondedAt: fmtDate(o.respondedAt) };
        }),
      };
    },
  },
  {
    key: "requisitions-by-requester",
    label: "Requester Report",
    description: "Job requisitions grouped by the person who raised them, with status, fill progress and aging.",
    category: "Recruitment",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const reqs = await prisma.jobRequisition.findMany({
        where: {
          orgId, deletedAt: null, raisedById: { not: null },
          ...((dateFrom || dateTo) ? { raisedAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}),
        },
        orderBy: [{ raisedById: "asc" }, { raisedAt: "desc" }],
      });
      const depts = await departmentMap(orgId, reqs.map((r) => r.departmentId));
      const raiserIds = [...new Set(reqs.map((r) => r.raisedById).filter(Boolean) as string[])];
      const raisers = raiserIds.length
        ? await prisma.employee.findMany({ where: { orgId, id: { in: raiserIds } }, select: { id: true, firstName: true, lastName: true } })
        : [];
      const rMap = new Map(raisers.map((e) => [e.id, fullName(e)]));
      const now = Date.now();
      return {
        title: "Requester Report",
        columns: [
          { key: "requester", label: "Requester", width: 22 },
          { key: "reqNumber", label: "Req #", width: 14 },
          { key: "title", label: "Title", width: 24 },
          { key: "department", label: "Department", width: 18 },
          { key: "positions", label: "Positions", width: 10 },
          { key: "filled", label: "Filled", width: 8 },
          { key: "status", label: "Status", width: 14 },
          { key: "priority", label: "Priority", width: 10 },
          { key: "raisedAt", label: "Raised On", width: 12 },
          { key: "ageDays", label: "Age (days)", width: 10 },
        ],
        rows: reqs.map((r) => ({
          requester: r.raisedById ? rMap.get(r.raisedById) ?? "" : "",
          reqNumber: r.requisitionNumber,
          title: r.title,
          department: r.departmentId ? depts.get(r.departmentId) ?? "" : "",
          positions: r.positions,
          filled: r.filledPositions,
          status: r.status,
          priority: r.priority,
          raisedAt: fmtDate(r.raisedAt),
          ageDays: r.raisedAt ? Math.max(0, Math.round((now - r.raisedAt.getTime()) / 86_400_000)) : "",
        })),
      };
    },
  },
];
