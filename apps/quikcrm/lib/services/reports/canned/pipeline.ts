/**
 * Canned reports — Pipeline category.
 *
 * Four reports drawing from `CrmOpportunity` with ACL applied via
 * `accountScopeFilter`. All amounts are returned as plain numbers so
 * the table renderer can format them per the column's `format: "currency"`.
 */
import type { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { accountScopeFilter } from "@/lib/auth/account-acl";
import { toNumber } from "@/lib/services/opportunities/currency";
import { daysAgoStartOfDay } from "./date-ranges";
import type { CannedReport, ReportRunContext } from "./types";

const CLOSED_STAGES = ["ClosedWon", "ClosedLost"] as const;
const STAGE_ORDER = [
  "Prospecting",
  "Qualification",
  "Proposal",
  "Negotiation",
  "ClosedWon",
  "ClosedLost",
] as const;
const STAGE_LABEL: Record<string, string> = {
  Prospecting: "Prospecting",
  Qualification: "Qualification",
  Proposal: "Proposal",
  Negotiation: "Negotiation",
  ClosedWon: "Won",
  ClosedLost: "Lost",
};

async function aclWhere(ctx: ReportRunContext): Promise<Prisma.CrmOpportunityWhereInput> {
  const acl = await accountScopeFilter(ctx.session);
  const base: Prisma.CrmOpportunityWhereInput = {
    orgId: ctx.orgId,
    deletedAt: null,
    ...(ctx.ownerId ? { ownerId: ctx.ownerId } : {}),
  };
  if (!acl) return base;
  return { AND: [base, acl as Prisma.CrmOpportunityWhereInput] };
}

const pipelineByStage: CannedReport = {
  id: "pipeline-by-stage",
  category: "Pipeline",
  title: "Pipeline by stage",
  blurb: "Open-deal count and weighted pipeline ₹, grouped by stage.",
  helpText:
    "Counts opportunities and sums their amount + weighted amount per stage. " +
    "Filtered by `createdAt` between the selected date range. " +
    "Closed-Won and Closed-Lost rows are included so you can see the full quarter at a glance. " +
    "Weighted ₹ = amount × probability ÷ 100.",
  defaultDateRange: "thisQuarter",
  buildDrillUrl: (row) => {
    const stage = String(row.stage ?? "");
    return stage ? `/opportunities?stage=${encodeURIComponent(stage)}` : null;
  },
  async run(ctx) {
    const where = await aclWhere(ctx);
    const rows = await db.crmOpportunity.groupBy({
      by: ["stage"],
      where: { ...where, createdAt: { gte: ctx.from, lte: ctx.to } },
      _count: { _all: true },
      _sum: { amount: true, weightedAmount: true },
    });
    const ordered = STAGE_ORDER.map((stage) => {
      const found = rows.find((r) => r.stage === stage);
      return {
        stage,
        stageLabel: STAGE_LABEL[stage] ?? stage,
        count: found?._count?._all ?? 0,
        amount: toNumber(found?._sum?.amount ?? 0),
        weightedAmount: toNumber(found?._sum?.weightedAmount ?? 0),
      };
    });
    const totalCount = ordered.reduce((s, r) => s + r.count, 0);
    return {
      columns: [
        { key: "stageLabel", label: "Stage" },
        { key: "count", label: "Deals", align: "right", format: "number" },
        { key: "amount", label: "Pipeline ₹", align: "right", format: "currency" },
        {
          key: "weightedAmount",
          label: "Weighted ₹",
          align: "right",
          format: "currency",
        },
      ],
      rows: ordered,
      total: { label: "Total deals", value: totalCount },
      chart: { type: "bar", xKey: "stageLabel", yKey: "weightedAmount" },
    };
  },
};

const pipelineByOwner: CannedReport = {
  id: "pipeline-by-owner",
  category: "Pipeline",
  title: "Pipeline by owner",
  blurb: "Open-deal count and weighted pipeline ₹, grouped by deal owner.",
  helpText:
    "Open opportunities (excludes Closed-Won and Closed-Lost) grouped by deal owner. " +
    "Weighted ₹ = amount × probability ÷ 100, summed per owner. " +
    "Sorted by weighted ₹ descending. The agent dropdown filter narrows to a single owner.",
  defaultDateRange: "thisQuarter",
  buildDrillUrl: (row) => {
    const ownerId = row.ownerId ? String(row.ownerId) : "";
    return ownerId ? `/opportunities?ownerId=${encodeURIComponent(ownerId)}` : null;
  },
  async run(ctx) {
    const where = await aclWhere(ctx);
    const rows = await db.crmOpportunity.groupBy({
      by: ["ownerId", "ownerName"],
      where: {
        ...where,
        stage: { notIn: [...CLOSED_STAGES] },
      },
      _count: { _all: true },
      _sum: { weightedAmount: true },
    });
    const result = rows
      .map((r) => ({
        ownerId: r.ownerId,
        ownerName: r.ownerName ?? "(unassigned)",
        count: r._count?._all ?? 0,
        weightedAmount: toNumber(r._sum?.weightedAmount ?? 0),
      }))
      .sort((a, b) => b.weightedAmount - a.weightedAmount);
    return {
      columns: [
        { key: "ownerName", label: "Owner" },
        { key: "count", label: "Open deals", align: "right", format: "number" },
        {
          key: "weightedAmount",
          label: "Weighted ₹",
          align: "right",
          format: "currency",
        },
      ],
      rows: result,
      chart: { type: "bar", xKey: "ownerName", yKey: "weightedAmount" },
    };
  },
};

const stuckDeals: CannedReport = {
  id: "stuck-deals",
  category: "Pipeline",
  title: "Stuck deals",
  blurb: "Open opportunities whose stage hasn't moved in 30+ days.",
  helpText:
    "Open opportunities whose `lastStageChangeAt` is older than 30 days from today (in your timezone). " +
    "Sorted by amount descending — biggest stuck deals first. " +
    "Use this to flag deals your team should re-engage or close out.",
  defaultDateRange: "thisQuarter",
  buildDrillUrl: (row) => {
    const id = row.id ? String(row.id) : "";
    return id ? `/opportunities/${id}` : null;
  },
  async run(ctx) {
    const where = await aclWhere(ctx);
    const cutoff = daysAgoStartOfDay(30, ctx.tz);
    const opps = await db.crmOpportunity.findMany({
      where: {
        ...where,
        stage: { notIn: [...CLOSED_STAGES] },
        lastStageChangeAt: { lt: cutoff },
      },
      select: {
        id: true,
        name: true,
        stage: true,
        amount: true,
        ownerName: true,
        lastStageChangeAt: true,
        account: { select: { name: true } },
      },
      orderBy: { amount: "desc" },
      take: 200,
    });
    const rows = opps.map((o) => ({
      id: o.id,
      name: o.name,
      accountName: o.account?.name ?? "",
      stage: STAGE_LABEL[o.stage] ?? o.stage,
      amount: toNumber(o.amount),
      ownerName: o.ownerName ?? "",
      lastStageChangeAt: o.lastStageChangeAt,
    }));
    return {
      columns: [
        { key: "name", label: "Deal" },
        { key: "accountName", label: "Account" },
        { key: "stage", label: "Stage" },
        { key: "amount", label: "Amount", align: "right", format: "currency" },
        { key: "ownerName", label: "Owner" },
        { key: "lastStageChangeAt", label: "Last moved", format: "date" },
      ],
      rows,
      total: { label: "Stuck deals", value: rows.length },
    };
  },
};

const closingThisMonth: CannedReport = {
  id: "closing-this-month",
  category: "Pipeline",
  title: "Closing this month",
  blurb: "Open opportunities with a close date inside the current month.",
  helpText:
    "Open opportunities (excludes Closed-Won and Closed-Lost) whose `closeDate` " +
    "falls inside the selected window — defaults to the first day of the current " +
    "month through today, in your timezone. Sorted by close date ascending so the " +
    "earliest are at the top. The footer shows total amount across all rows.",
  defaultDateRange: "thisMonth",
  buildDrillUrl: (row) => {
    const id = row.id ? String(row.id) : "";
    return id ? `/opportunities/${id}` : null;
  },
  async run(ctx) {
    const where = await aclWhere(ctx);
    const opps = await db.crmOpportunity.findMany({
      where: {
        ...where,
        stage: { notIn: [...CLOSED_STAGES] },
        closeDate: { gte: ctx.from, lte: ctx.to },
      },
      select: {
        id: true,
        name: true,
        stage: true,
        amount: true,
        weightedAmount: true,
        closeDate: true,
        ownerName: true,
        account: { select: { name: true } },
      },
      orderBy: { closeDate: "asc" },
      take: 500,
    });
    const rows = opps.map((o) => ({
      id: o.id,
      name: o.name,
      accountName: o.account?.name ?? "",
      stage: STAGE_LABEL[o.stage] ?? o.stage,
      amount: toNumber(o.amount),
      weightedAmount: toNumber(o.weightedAmount),
      closeDate: o.closeDate,
      ownerName: o.ownerName ?? "",
    }));
    const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
    return {
      columns: [
        { key: "closeDate", label: "Close", format: "date" },
        { key: "name", label: "Deal" },
        { key: "accountName", label: "Account" },
        { key: "stage", label: "Stage" },
        { key: "amount", label: "Amount", align: "right", format: "currency" },
        {
          key: "weightedAmount",
          label: "Weighted",
          align: "right",
          format: "currency",
        },
        { key: "ownerName", label: "Owner" },
      ],
      rows,
      total: { label: "Total amount", value: totalAmount },
    };
  },
};

export const PIPELINE_REPORTS: CannedReport[] = [
  pipelineByStage,
  pipelineByOwner,
  stuckDeals,
  closingThisMonth,
];
