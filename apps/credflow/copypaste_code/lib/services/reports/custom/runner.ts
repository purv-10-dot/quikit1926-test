/**
 * Executes ad-hoc custom reports (groupBy + metric) with tenant + ACL guards.
 */
import type { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { accountScopeFilter } from "@/lib/auth/account-acl";
import { toNumber } from "@/lib/services/opportunities/currency";
import type { ReportRunContext } from "../canned/types";
import { getObjectMeta, isAllowedGroupBy, isAllowedMetric } from "./catalog";
import type { CustomReportDefinition, CustomReportRunOutput } from "./types";

function labelForGroup(object: string, groupBy: string): string {
  const meta = getObjectMeta(object);
  return meta?.groupByFields.find((f) => f.key === groupBy)?.label ?? groupBy;
}

function metricLabel(metric: string): string {
  switch (metric) {
    case "sumAmount":
      return "Amount";
    case "sumDuration":
      return "Duration (sec)";
    default:
      return "Count";
  }
}

async function leadWhere(ctx: ReportRunContext): Promise<Prisma.CrmLeadWhereInput> {
  const acl = await accountScopeFilter(ctx.session);
  const base: Prisma.CrmLeadWhereInput = {
    tenantId: ctx.tenantId,
    createdAt: { gte: ctx.from, lte: ctx.to },
    ...(ctx.ownerId ? { ownerId: ctx.ownerId } : {}),
  };
  if (!acl) return base;
  return { AND: [base, acl as Prisma.CrmLeadWhereInput] };
}

async function opportunityWhere(
  ctx: ReportRunContext,
): Promise<Prisma.CrmOpportunityWhereInput> {
  const acl = await accountScopeFilter(ctx.session);
  const base: Prisma.CrmOpportunityWhereInput = {
    tenantId: ctx.tenantId,
    deletedAt: null,
    createdAt: { gte: ctx.from, lte: ctx.to },
    ...(ctx.ownerId ? { ownerId: ctx.ownerId } : {}),
  };
  if (!acl) return base;
  return { AND: [base, acl as Prisma.CrmOpportunityWhereInput] };
}

function activityWhere(ctx: ReportRunContext): Prisma.CrmActivityWhereInput {
  return {
    tenantId: ctx.tenantId,
    occurredAt: { gte: ctx.from, lte: ctx.to },
    ...(ctx.ownerId ? { ownerId: ctx.ownerId } : {}),
  };
}

function callLogWhere(ctx: ReportRunContext): Prisma.CrmCallLogWhereInput {
  return {
    tenantId: ctx.tenantId,
    createdAt: { gte: ctx.from, lte: ctx.to },
    ...(ctx.ownerId ? { agentUserId: ctx.ownerId } : {}),
  };
}

function bucketLabel(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "(blank)";
  return String(raw);
}

export async function runCustomReport(
  definition: CustomReportDefinition,
  ctx: ReportRunContext,
): Promise<CustomReportRunOutput> {
  if (!getObjectMeta(definition.object)) {
    throw new Error(`Unknown report object "${definition.object}"`);
  }
  if (!isAllowedGroupBy(definition.object, definition.groupBy)) {
    throw new Error(`Invalid group-by field "${definition.groupBy}"`);
  }
  if (!isAllowedMetric(definition.object, definition.metric)) {
    throw new Error(`Invalid metric "${definition.metric}"`);
  }

  const dimKey = "dimension";
  const dimLabel = labelForGroup(definition.object, definition.groupBy);
  const valueKey = "value";
  const valueLabel = metricLabel(definition.metric);
  const valueFormat =
    definition.metric === "sumAmount"
      ? ("currency" as const)
      : definition.metric === "sumDuration"
        ? ("duration" as const)
        : ("number" as const);

  let rows: Record<string, unknown>[] = [];

  if (definition.object === "leads") {
    const where = await leadWhere(ctx);
    const grouped = await db.crmLead.groupBy({
      by: [definition.groupBy as "source"],
      where,
      _count: { _all: true },
    });
    rows = grouped.map((g) => ({
      [dimKey]: bucketLabel((g as Record<string, unknown>)[definition.groupBy]),
      [valueKey]: g._count._all,
    }));
  } else if (definition.object === "opportunities") {
    const where = await opportunityWhere(ctx);
    if (definition.metric === "sumAmount") {
      const grouped = await db.crmOpportunity.groupBy({
        by: [definition.groupBy as "stage"],
        where,
        _sum: { amount: true },
        _count: { _all: true },
      });
      rows = grouped.map((g) => ({
        [dimKey]: bucketLabel((g as Record<string, unknown>)[definition.groupBy]),
        [valueKey]: toNumber(g._sum.amount ?? 0),
      }));
    } else {
      const grouped = await db.crmOpportunity.groupBy({
        by: [definition.groupBy as "stage"],
        where,
        _count: { _all: true },
      });
      rows = grouped.map((g) => ({
        [dimKey]: bucketLabel((g as Record<string, unknown>)[definition.groupBy]),
        [valueKey]: g._count._all,
      }));
    }
  } else if (definition.object === "activities") {
    const grouped = await db.crmActivity.groupBy({
      by: [definition.groupBy as "type"],
      where: activityWhere(ctx),
      _count: { _all: true },
    });
    rows = grouped.map((g) => ({
      [dimKey]: bucketLabel((g as Record<string, unknown>)[definition.groupBy]),
      [valueKey]: g._count._all,
    }));
  } else {
    const where = callLogWhere(ctx);
    if (definition.metric === "sumDuration") {
      const grouped = await db.crmCallLog.groupBy({
        by: [definition.groupBy as "status"],
        where,
        _sum: { durationSec: true },
        _count: { _all: true },
      });
      rows = grouped.map((g) => ({
        [dimKey]: bucketLabel((g as Record<string, unknown>)[definition.groupBy]),
        [valueKey]: Number(g._sum.durationSec ?? 0),
      }));
    } else {
      const grouped = await db.crmCallLog.groupBy({
        by: [definition.groupBy as "status"],
        where,
        _count: { _all: true },
      });
      rows = grouped.map((g) => ({
        [dimKey]: bucketLabel((g as Record<string, unknown>)[definition.groupBy]),
        [valueKey]: g._count._all,
      }));
    }
  }

  rows.sort((a, b) => Number(b[valueKey] ?? 0) - Number(a[valueKey] ?? 0));

  const totalValue = rows.reduce((s, r) => s + Number(r[valueKey] ?? 0), 0);
  const title =
    definition.title?.trim() ||
    `${getObjectMeta(definition.object)!.label} by ${dimLabel}`;

  return {
    definition,
    columns: [
      { key: dimKey, label: dimLabel },
      { key: valueKey, label: valueLabel, align: "right", format: valueFormat },
    ],
    rows,
    total: { label: valueLabel, value: totalValue },
    chart: {
      type: rows.length > 8 ? "bar" : "pie",
      xKey: dimKey,
      yKey: valueKey,
    },
  };
}
