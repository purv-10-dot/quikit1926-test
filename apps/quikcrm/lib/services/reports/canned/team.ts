/**
 * Canned reports — Team category.
 *
 * "Sales User" / "Sales Manager direct reports" depend on Membership +
 * CrmSalesGroup structures rather than a hard role enum, so the helpers
 * here resolve those at run time per tenant.
 *
 * Heuristic: a lead counts as "qualified" when its stage moved past
 * "New" (the canonical default initial stage). This matches how
 * conversion-rate is reasoned about across the rest of the CRM, but
 * tenants with bespoke pipelines may need to tune the threshold.
 */
import { db } from "@/lib/db";
import { startOfMonthInTz, daysAgoStartOfDay } from "./date-ranges";
import type { CannedReport, ReportRunContext } from "./types";

const SALES_USER_ROLES = ["user", "member", "sales_user", "salesuser"];

async function tenantSalesUserMemberships(orgId: string) {
  const lowered = SALES_USER_ROLES.map((r) => r.toLowerCase());
  const all = await db.orgMember.findMany({
    where: { orgId: orgId },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  return all.filter((m) => lowered.includes((m.role ?? "").toLowerCase()));
}

async function directReportUserIds(ctx: ReportRunContext): Promise<string[]> {
  // CrmSalesGroupManager rows for this user → groups managed → members.
  const managed = await db.crmSalesGroupManager.findMany({
    where: { userId: ctx.session.userId },
    select: { groupId: true },
  });
  if (managed.length === 0) return [];
  const groupIds = [...new Set(managed.map((m) => m.groupId))];
  const members = await db.crmSalesGroupMember.findMany({
    where: { groupId: { in: groupIds } },
    select: { userId: true },
  });
  return [...new Set(members.map((m) => m.userId))];
}

const teamConversionRate: CannedReport = {
  id: "team-conversion-rate",
  category: "Team",
  title: "Team conversion rate",
  blurb:
    "For each sales user: qualified-leads ÷ total-leads created this month. " +
    "A lead counts as qualified once its stage moves past 'New'.",
  helpText:
    "For every Sales User in this tenant (resolved via Membership.role), counts: " +
    "Total leads = leads created this month and owned by them; " +
    "Qualified = of those, leads whose stage is anything other than 'New'; " +
    "Conversion % = qualified ÷ total (rounded to 1 decimal). " +
    "'This month' starts at the first day of the calendar month in your timezone " +
    "and ends at the current moment. Sorted by conversion % descending.",
  defaultDateRange: "thisMonth",
  buildDrillUrl: (row) => {
    const ownerId = row.userId ? String(row.userId) : "";
    return ownerId ? `/leads?ownerId=${encodeURIComponent(ownerId)}` : null;
  },
  async run(ctx) {
    const monthStart = startOfMonthInTz(ctx.to, ctx.tz);
    const memberships = await tenantSalesUserMemberships(ctx.orgId);
    if (memberships.length === 0) {
      return {
        columns: [
          { key: "name", label: "User" },
          { key: "totalLeads", label: "Total leads", align: "right", format: "number" },
          {
            key: "qualifiedLeads",
            label: "Qualified",
            align: "right",
            format: "number",
          },
          {
            key: "conversionPct",
            label: "Conversion",
            align: "right",
            format: "percent",
          },
        ],
        rows: [],
      };
    }
    const userIds = memberships.map((m) => m.user.id);
    const totals = await db.crmLead.groupBy({
      by: ["ownerId"],
      where: {
        orgId: ctx.orgId,
        // Exclude trashed leads — CrmLead is not covered by the soft-delete middleware.
        deletedAt: null,
        ownerId: { in: userIds },
        createdAt: { gte: monthStart, lte: ctx.to },
      },
      _count: { _all: true },
    });
    const qualified = await db.crmLead.groupBy({
      by: ["ownerId"],
      where: {
        orgId: ctx.orgId,
        deletedAt: null,
        ownerId: { in: userIds },
        createdAt: { gte: monthStart, lte: ctx.to },
        stage: { not: "New" },
      },
      _count: { _all: true },
    });
    const totalsByUser = new Map(
      totals.map((t) => [t.ownerId ?? "", t._count?._all ?? 0]),
    );
    const qualifiedByUser = new Map(
      qualified.map((q) => [q.ownerId ?? "", q._count?._all ?? 0]),
    );
    const rows = memberships
      .map((m) => {
        const total = totalsByUser.get(m.user.id) ?? 0;
        const qual = qualifiedByUser.get(m.user.id) ?? 0;
        const name =
          `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim() ||
          m.user.email ||
          m.user.id;
        return {
          userId: m.user.id,
          name,
          totalLeads: total,
          qualifiedLeads: qual,
          conversionPct: total > 0 ? Math.round((qual / total) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.conversionPct - a.conversionPct || b.totalLeads - a.totalLeads);
    return {
      columns: [
        { key: "name", label: "User" },
        { key: "totalLeads", label: "Total leads", align: "right", format: "number" },
        {
          key: "qualifiedLeads",
          label: "Qualified",
          align: "right",
          format: "number",
        },
        {
          key: "conversionPct",
          label: "Conversion",
          align: "right",
          format: "percent",
        },
      ],
      rows,
      chart: { type: "bar", xKey: "name", yKey: "conversionPct" },
    };
  },
};

const teamDispositionMix: CannedReport = {
  id: "team-disposition-mix",
  category: "Team",
  title: "Team disposition mix",
  blurb:
    "Top 8 call dispositions for the current manager's direct reports " +
    "over the last 7 days. Empty when the caller manages no sales group.",
  helpText:
    "Resolves your direct reports by walking CrmSalesGroupManager → CrmSalesGroupMember, " +
    "then counts those users' call logs by `dispositionName` over the last 7 days. " +
    "Returns the top 8 dispositions sorted by count, rendered as a pie chart. " +
    "Returns empty rows when the signed-in user manages no sales group at all.",
  defaultDateRange: "7d",
  buildDrillUrl: (row) => {
    const disposition = String(row.dispositionName ?? "");
    return disposition
      ? `/telephony/call-logs?disposition=${encodeURIComponent(disposition)}`
      : null;
  },
  async run(ctx) {
    const reportIds = await directReportUserIds(ctx);
    if (reportIds.length === 0) {
      return {
        columns: [
          { key: "dispositionName", label: "Disposition" },
          { key: "count", label: "Calls", align: "right", format: "number" },
        ],
        rows: [],
      };
    }
    const cutoff = daysAgoStartOfDay(7, ctx.tz);
    const grouped = await db.crmCallLog.groupBy({
      by: ["dispositionName"],
      where: {
        orgId: ctx.orgId,
        agentUserId: { in: reportIds },
        createdAt: { gte: cutoff, lte: ctx.to },
      },
      _count: { _all: true },
    });
    const rows = grouped
      .map((g) => ({
        dispositionName: g.dispositionName ?? "(none)",
        count: g._count?._all ?? 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const total = rows.reduce((s, r) => s + r.count, 0);
    return {
      columns: [
        { key: "dispositionName", label: "Disposition" },
        { key: "count", label: "Calls", align: "right", format: "number" },
      ],
      rows,
      total: { label: "Total calls", value: total },
      chart: { type: "pie", xKey: "dispositionName", yKey: "count" },
    };
  },
};

export const TEAM_REPORTS: CannedReport[] = [teamConversionRate, teamDispositionMix];
