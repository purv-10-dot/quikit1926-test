import { prisma } from "@/lib/prisma";
import type { ReportDefinition } from "../types";
import { fmtDate, fullName, num } from "../format";
import { employeeBasics } from "../payroll-data";

const dec = (v: unknown) => (v == null ? "" : num(v));

export const performanceReports: ReportDefinition[] = [
  {
    key: "goals-okr",
    label: "Goals / OKR Progress",
    description: "Individual and team goals with target, current value, progress and status.",
    category: "Performance",
    async run({ orgId }) {
      const goals = await prisma.hrmsGoal.findMany({ where: { orgId, deletedAt: null }, orderBy: { dueDate: "asc" }, take: 10000 });
      const empMap = await employeeBasics(orgId, goals.map((g) => g.employeeId));
      return {
        title: "Goals / OKR Progress",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 20 },
          { key: "title", label: "Goal", width: 28 },
          { key: "type", label: "Type", width: 12 },
          { key: "category", label: "Category", width: 14 },
          { key: "target", label: "Target", width: 12 },
          { key: "current", label: "Current", width: 12 },
          { key: "progress", label: "Progress %", width: 10 },
          { key: "status", label: "Status", width: 12 },
          { key: "dueDate", label: "Due Date", width: 12 },
        ],
        rows: goals.map((g) => {
          const e = empMap.get(g.employeeId);
          return { code: e?.employeeCode ?? "", name: fullName(e), title: g.title, type: g.type, category: g.category, target: num(g.targetValue), current: num(g.currentValue), progress: num(g.progress), status: g.status, dueDate: fmtDate(g.dueDate) };
        }),
      };
    },
  },
  {
    key: "appraisal-summary",
    label: "Appraisal Summary",
    description: "Per-cycle appraisal ratings, final band and status for each employee.",
    category: "Performance",
    async run({ orgId }) {
      const apps = await prisma.employeeAppraisal.findMany({ where: { orgId, deletedAt: null }, orderBy: { createdAt: "desc" } });
      const empMap = await employeeBasics(orgId, apps.map((a) => a.employeeId));
      const cycleIds = [...new Set(apps.map((a) => a.cycleId))];
      const cycles = cycleIds.length ? await prisma.appraisalCycle.findMany({ where: { orgId, id: { in: cycleIds } }, select: { id: true, name: true } }) : [];
      const cycleMap = new Map(cycles.map((c) => [c.id, c.name]));
      return {
        title: "Appraisal Summary",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 20 },
          { key: "cycle", label: "Cycle", width: 20 },
          { key: "selfRating", label: "Self", width: 8 },
          { key: "managerRating", label: "Manager", width: 8 },
          { key: "finalRating", label: "Final", width: 8 },
          { key: "finalBand", label: "Band", width: 12 },
          { key: "promotion", label: "Promotion", width: 10 },
          { key: "status", label: "Status", width: 12 },
        ],
        rows: apps.map((a) => {
          const e = empMap.get(a.employeeId);
          return {
            code: e?.employeeCode ?? "", name: fullName(e), cycle: cycleMap.get(a.cycleId) ?? "",
            selfRating: dec(a.selfRating), managerRating: dec(a.managerRating), finalRating: dec(a.finalRating),
            finalBand: a.finalBand ?? "", promotion: a.promotionRecommendation ? "Yes" : "", status: a.status,
          };
        }),
      };
    },
  },
  {
    key: "pip",
    label: "Performance Improvement Plans",
    description: "Active and closed PIPs with reason, window and outcome.",
    category: "Performance",
    async run({ orgId }) {
      const pips = await prisma.pIP.findMany({ where: { orgId, deletedAt: null }, orderBy: { startDate: "desc" } });
      const empMap = await employeeBasics(orgId, pips.map((p) => p.employeeId));
      return {
        title: "Performance Improvement Plans",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "reason", label: "Reason", width: 30 },
          { key: "startDate", label: "Start", width: 12 },
          { key: "endDate", label: "End", width: 12 },
          { key: "status", label: "Status", width: 16 },
          { key: "outcome", label: "Outcome", width: 16 },
        ],
        rows: pips.map((p) => {
          const e = empMap.get(p.employeeId);
          return { code: e?.employeeCode ?? "", name: fullName(e), reason: p.reason, startDate: fmtDate(p.startDate), endDate: fmtDate(p.endDate), status: p.status, outcome: p.outcome ?? "" };
        }),
      };
    },
  },
  {
    key: "continuous-feedback",
    label: "Continuous Feedback",
    description: "Peer/manager feedback exchanged, by type and category.",
    category: "Performance",
    async run({ orgId }) {
      const fb = await prisma.continuousFeedback.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 10000 });
      const empMap = await employeeBasics(orgId, fb.flatMap((f) => [f.fromEmployeeId, f.toEmployeeId]));
      return {
        title: "Continuous Feedback",
        columns: [
          { key: "from", label: "From", width: 22 },
          { key: "to", label: "To", width: 22 },
          { key: "type", label: "Type", width: 14 },
          { key: "category", label: "Category", width: 16 },
          { key: "date", label: "Date", width: 12 },
        ],
        rows: fb.map((f) => ({ from: fullName(empMap.get(f.fromEmployeeId)), to: fullName(empMap.get(f.toEmployeeId)), type: f.type, category: f.category, date: fmtDate(f.createdAt) })),
      };
    },
  },
  {
    key: "recognition",
    label: "Recognition & Kudos",
    description: "Recognition given between employees, with points.",
    category: "Performance",
    async run({ orgId }) {
      const recs = await prisma.recognition.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 10000 });
      const empMap = await employeeBasics(orgId, recs.flatMap((r) => [r.fromEmployeeId, r.toEmployeeId]));
      return {
        title: "Recognition & Kudos",
        columns: [
          { key: "from", label: "From", width: 22 },
          { key: "to", label: "To", width: 22 },
          { key: "type", label: "Type", width: 14 },
          { key: "points", label: "Points", width: 10 },
          { key: "message", label: "Message", width: 32 },
          { key: "date", label: "Date", width: 12 },
        ],
        rows: recs.map((r) => ({ from: fullName(empMap.get(r.fromEmployeeId)), to: fullName(empMap.get(r.toEmployeeId)), type: r.type, points: r.points, message: r.message, date: fmtDate(r.createdAt) })),
      };
    },
  },
  {
    key: "survey-results",
    label: "Survey / eNPS Results",
    description: "Engagement and pulse surveys with response rate and status.",
    category: "Performance",
    async run({ orgId }) {
      const surveys = await prisma.hrmsSurvey.findMany({ where: { orgId, deletedAt: null }, orderBy: { startDate: "desc" } });
      const counts = surveys.length ? await prisma.hrmsSurveyResponse.groupBy({ by: ["surveyId"], where: { orgId, surveyId: { in: surveys.map((s) => s.id) } }, _count: { _all: true } }) : [];
      const countMap = new Map(counts.map((c) => [c.surveyId, c._count._all]));
      return {
        title: "Survey / eNPS Results",
        columns: [
          { key: "title", label: "Survey", width: 28 },
          { key: "type", label: "Type", width: 16 },
          { key: "status", label: "Status", width: 14 },
          { key: "responses", label: "Responses", width: 12 },
          { key: "responseRate", label: "Response %", width: 12 },
          { key: "startDate", label: "Start", width: 12 },
          { key: "endDate", label: "End", width: 12 },
        ],
        rows: surveys.map((s) => ({ title: s.title, type: s.type, status: s.status, responses: countMap.get(s.id) ?? 0, responseRate: num(s.responseRate), startDate: fmtDate(s.startDate), endDate: fmtDate(s.endDate) })),
      };
    },
  },
];
