/**
 * Canned reports — Leads category.
 *
 * `CrmLead` has no `lastActivityAt` denorm column — the spec asks for a
 * stale-lead threshold of "7 days since lastActivity". We approximate
 * with `updatedAt` (the closest available proxy) and document the
 * deviation in `PHASE-2-REPORT.md`. A follow-up integration that adds
 * `lastActivityAt` should replace the proxy here.
 */
import type { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { accountScopeFilter } from "@/lib/auth/account-acl";
import { daysAgoStartOfDay } from "./date-ranges";
import type { CannedReport, ReportRunContext } from "./types";

async function leadAclWhere(ctx: ReportRunContext): Promise<Prisma.CrmLeadWhereInput> {
  const acl = await accountScopeFilter(ctx.session);
  const base: Prisma.CrmLeadWhereInput = {
    orgId: ctx.orgId,
    ...(ctx.ownerId ? { ownerId: ctx.ownerId } : {}),
  };
  if (!acl) return base;
  return { AND: [base, acl as Prisma.CrmLeadWhereInput] };
}

const leadsBySource: CannedReport = {
  id: "leads-by-source",
  category: "Leads",
  title: "Leads by source",
  blurb: "Lead count grouped by source over the selected window.",
  helpText:
    "Counts leads by their `source` field. Filtered by `createdAt` between the " +
    "selected date range. Leads with no source are bucketed as '(unknown)'. " +
    "Sorted by count descending. Use to compare which channels deliver volume.",
  defaultDateRange: "30d",
  buildDrillUrl: (row, ctx) => {
    const source = String(row.source ?? "");
    if (!source) return null;
    const params = new URLSearchParams({
      source,
      from: ctx.from.toISOString(),
      to: ctx.to.toISOString(),
    });
    return `/leads?${params.toString()}`;
  },
  async run(ctx) {
    const where = await leadAclWhere(ctx);
    const grouped = await db.crmLead.groupBy({
      by: ["source"],
      where: { ...where, createdAt: { gte: ctx.from, lte: ctx.to } },
      _count: { _all: true },
    });
    const rows = grouped
      .map((g) => ({
        source: g.source ?? "(unknown)",
        count: g._count?._all ?? 0,
      }))
      .sort((a, b) => b.count - a.count);
    const totalCount = rows.reduce((s, r) => s + r.count, 0);
    return {
      columns: [
        { key: "source", label: "Source" },
        { key: "count", label: "Leads", align: "right", format: "number" },
      ],
      rows,
      total: { label: "Total leads", value: totalCount },
      chart: { type: "bar", xKey: "source", yKey: "count" },
    };
  },
};

const leadFunnel: CannedReport = {
  id: "lead-funnel",
  category: "Leads",
  title: "Lead funnel",
  blurb: "Lead count per stage with % of total reached.",
  helpText:
    "Counts leads per stage. Filtered by `createdAt` between the selected date " +
    "range. Each row's 'Share' = stage count ÷ total leads (rounded to 1 decimal). " +
    "Sorted by count descending so the top of funnel reads first.",
  defaultDateRange: "thisQuarter",
  buildDrillUrl: (row) => {
    const stage = String(row.stage ?? "");
    return stage ? `/leads?stage=${encodeURIComponent(stage)}` : null;
  },
  async run(ctx) {
    const where = await leadAclWhere(ctx);
    const grouped = await db.crmLead.groupBy({
      by: ["stage"],
      where: { ...where, createdAt: { gte: ctx.from, lte: ctx.to } },
      _count: { _all: true },
    });
    const total = grouped.reduce((s, g) => s + (g._count?._all ?? 0), 0);
    // Sorted descending so the funnel reads top-of-funnel first when
    // the tenant uses sensible default stage names.
    const rows = grouped
      .map((g) => ({
        stage: g.stage,
        count: g._count?._all ?? 0,
        sharePct: total > 0 ? Math.round(((g._count?._all ?? 0) / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);
    return {
      columns: [
        { key: "stage", label: "Stage" },
        { key: "count", label: "Leads", align: "right", format: "number" },
        { key: "sharePct", label: "Share", align: "right", format: "percent" },
      ],
      rows,
      total: { label: "Total leads", value: total },
      chart: { type: "bar", xKey: "stage", yKey: "count" },
    };
  },
};

const staleLeads: CannedReport = {
  id: "stale-leads",
  category: "Leads",
  title: "Stale leads",
  blurb:
    "Active leads not touched in 7+ days. Sorted by score; oldest first.",
  helpText:
    "Leads still in play — `convertedAt` is null and `isDisengaged` = false — " +
    "whose `updatedAt` is older than 7 days from today (in your timezone). " +
    "Sorted by score descending, then by createdAt ascending so oldest stale leads " +
    "rise to the top. Use to surface leads that need re-engagement.",
  defaultDateRange: "30d",
  buildDrillUrl: (row) => {
    const id = row.id ? String(row.id) : "";
    return id ? `/leads/${id}` : null;
  },
  async run(ctx) {
    const where = await leadAclWhere(ctx);
    const cutoff = daysAgoStartOfDay(7, ctx.tz);
    const leads = await db.crmLead.findMany({
      where: {
        ...where,
        convertedAt: null,
        isDisengaged: false,
        updatedAt: { lt: cutoff },
      },
      select: {
        id: true,
        name: true,
        company: true,
        ownerName: true,
        stage: true,
        status: true,
        score: true,
        updatedAt: true,
      },
      orderBy: [{ score: "desc" }, { createdAt: "asc" }],
      take: 200,
    });
    const rows = leads.map((l) => ({
      id: l.id,
      name: l.name,
      company: l.company ?? "",
      ownerName: l.ownerName ?? "",
      stage: l.stage,
      status: l.status,
      score: l.score,
      updatedAt: l.updatedAt,
    }));
    return {
      columns: [
        { key: "name", label: "Lead" },
        { key: "company", label: "Company" },
        { key: "stage", label: "Stage" },
        { key: "status", label: "Status" },
        { key: "ownerName", label: "Owner" },
        { key: "score", label: "Score", align: "right", format: "number" },
        { key: "updatedAt", label: "Last touched", format: "date" },
      ],
      rows,
      total: { label: "Stale leads", value: rows.length },
    };
  },
};

export const LEAD_REPORTS: CannedReport[] = [leadsBySource, leadFunnel, staleLeads];
