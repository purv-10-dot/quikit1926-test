/**
 * Executes ad-hoc custom reports (groupBy + metric + filters) with tenant +
 * ACL guards. Group-by can be a categorical field or a `date:<grain>` time
 * bucket; filters are re-validated against the catalog whitelist before any
 * value reaches Prisma.
 */
import type { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { accountScopeFilter } from "@/lib/auth/account-acl";
import { toNumber } from "@/lib/services/opportunities/currency";
import type { ReportRunContext } from "../canned/types";
import {
  getFilterField,
  getObjectMeta,
  isAllowedGroupBy,
  isAllowedMetric,
} from "./catalog";
import type {
  CustomReportChartType,
  CustomReportDefinition,
  CustomReportFieldType,
  CustomReportRunOutput,
  ReportFilter,
} from "./types";

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
    case "avgScore":
      return "Avg score";
    case "sumScore":
      return "Sum of score";
    default:
      return "Count";
  }
}

/** Round to 1 decimal place (used for average metrics). */
function roundTo1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Filters (whitelisted) → Prisma where fragments
// ---------------------------------------------------------------------------

function coerceFilterValue(
  value: string | undefined,
  type: CustomReportFieldType,
): unknown {
  if (value === undefined) return undefined;
  if (type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === "boolean") return value === "true" || value === "1";
  if (type === "date") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return value;
}

function filterCondition(
  field: string,
  operator: ReportFilter["operator"],
  value: string | undefined,
  type: CustomReportFieldType,
): Record<string, unknown> | null {
  switch (operator) {
    case "is_empty":
      return type === "string"
        ? { OR: [{ [field]: null }, { [field]: "" }] }
        : { [field]: null };
    case "is_not_empty":
      return type === "string"
        ? { AND: [{ [field]: { not: null } }, { [field]: { not: "" } }] }
        : { [field]: { not: null } };
    case "contains": {
      if (type !== "string" || !value) return null;
      return { [field]: { contains: value, mode: "insensitive" } };
    }
    case "in": {
      if (!value) return null;
      const raw = value.split(",").map((s) => s.trim()).filter(Boolean);
      if (raw.length === 0) return null;
      const list =
        type === "number"
          ? raw.map(Number).filter((n) => Number.isFinite(n))
          : raw;
      return list.length ? { [field]: { in: list } } : null;
    }
    case "equals": {
      const v = coerceFilterValue(value, type);
      return v === undefined ? null : { [field]: v };
    }
    case "not_equals": {
      const v = coerceFilterValue(value, type);
      return v === undefined ? null : { [field]: { not: v } };
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const v = coerceFilterValue(value, type);
      return v === undefined ? null : { [field]: { [operator]: v } };
    }
    default:
      return null;
  }
}

function buildFilterConditions(
  object: string,
  filters: ReportFilter[] | undefined,
): Record<string, unknown>[] {
  if (!filters?.length) return [];
  const out: Record<string, unknown>[] = [];
  for (const f of filters) {
    const meta = getFilterField(object, f.field);
    if (!meta) continue; // whitelist: silently ignore unknown fields
    const cond = filterCondition(f.field, f.operator, f.value, meta.type);
    if (cond) out.push(cond);
  }
  return out;
}

/** Merge filter fragments into a typed where via an extra AND. */
function withFilters<T>(where: T, conds: Record<string, unknown>[]): T {
  if (conds.length === 0) return where;
  // The conds are whitelisted (field + safe operator), but Prisma's generated
  // where type can't see that — cast through unknown rather than `as any`.
  return { AND: [where, ...conds] } as unknown as T;
}

// ---------------------------------------------------------------------------
// Base where builders (date range + owner + ACL)
// ---------------------------------------------------------------------------

async function leadWhere(ctx: ReportRunContext): Promise<Prisma.QcfLeadWhereInput> {
  const acl = await accountScopeFilter(ctx.session);
  const base: Prisma.QcfLeadWhereInput = {
    orgId: ctx.orgId,
    createdAt: { gte: ctx.from, lte: ctx.to },
    ...(ctx.ownerId ? { ownerId: ctx.ownerId } : {}),
  };
  if (!acl) return base;
  return { AND: [base, acl as Prisma.QcfLeadWhereInput] };
}

async function opportunityWhere(
  ctx: ReportRunContext,
): Promise<Prisma.QcfOpportunityWhereInput> {
  const acl = await accountScopeFilter(ctx.session);
  const base: Prisma.QcfOpportunityWhereInput = {
    orgId: ctx.orgId,
    deletedAt: null,
    createdAt: { gte: ctx.from, lte: ctx.to },
    ...(ctx.ownerId ? { ownerId: ctx.ownerId } : {}),
  };
  if (!acl) return base;
  return { AND: [base, acl as Prisma.QcfOpportunityWhereInput] };
}

function activityWhere(ctx: ReportRunContext): Prisma.QcfActivityWhereInput {
  return {
    orgId: ctx.orgId,
    occurredAt: { gte: ctx.from, lte: ctx.to },
    ...(ctx.ownerId ? { ownerId: ctx.ownerId } : {}),
  };
}

function callLogWhere(ctx: ReportRunContext): Prisma.QcfCallLogWhereInput {
  return {
    orgId: ctx.orgId,
    createdAt: { gte: ctx.from, lte: ctx.to },
    ...(ctx.ownerId ? { agentUserId: ctx.ownerId } : {}),
  };
}

function bucketLabel(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "(blank)";
  return String(raw);
}

/**
 * Group-by fields that hold a user id — their bucket value is a raw UUID and
 * must be resolved to a display name so the chart/table don't show ids.
 */
const USER_REF_GROUP_BYS = new Set(["ownerId", "agentUserId"]);

/** id → display name for the tenant's org members (matches the pages' logic). */
async function resolveUserNames(orgId: string): Promise<Map<string, string>> {
  const members = await db.orgMember.findMany({
    where: { orgId: orgId },
    select: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });
  const map = new Map<string, string>();
  for (const m of members) {
    const u = m.user;
    const name =
      `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || u.id;
    map.set(u.id, name);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Date bucketing (group by day / week / month / quarter, tz-aware)
// ---------------------------------------------------------------------------

function dateBucketKey(d: Date, grain: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  const y = get("year");
  const m = get("month");
  const day = get("day");
  if (grain === "month") return `${y}-${m}`;
  if (grain === "quarter") {
    const q = Math.floor((Number(m) - 1) / 3) + 1;
    return `${y}-Q${q}`;
  }
  if (grain === "week") {
    const base = new Date(`${y}-${m}-${day}T00:00:00Z`);
    const dow = base.getUTCDay(); // 0 Sun..6 Sat
    const sinceMonday = (dow + 6) % 7;
    const monday = new Date(base.getTime() - sinceMonday * 86400000);
    return monday.toISOString().slice(0, 10);
  }
  return `${y}-${m}-${day}`; // day
}

const DATE_FETCH_CAP = 50_000;

async function runDateBucket(
  object: string,
  where: unknown,
  grain: string,
  metric: string,
  tz: string,
): Promise<Record<string, unknown>[]> {
  // Accumulate sum + count per bucket so any metric (count / sum / avg) can be
  // derived from the same pass.
  const acc = new Map<string, { sum: number; count: number }>();
  const add = (d: Date | null | undefined, amount: number) => {
    if (!d) return;
    const key = dateBucketKey(d, grain, tz);
    const cur = acc.get(key) ?? { sum: 0, count: 0 };
    cur.sum += amount;
    cur.count += 1;
    acc.set(key, cur);
  };

  if (object === "leads") {
    const needScore = metric === "avgScore" || metric === "sumScore";
    const rows = await db.qcfLead.findMany({
      where: where as Prisma.QcfLeadWhereInput,
      select: { createdAt: true, score: true },
      take: DATE_FETCH_CAP,
    });
    for (const r of rows) add(r.createdAt, needScore ? Number(r.score ?? 0) : 1);
  } else if (object === "opportunities") {
    if (metric === "sumAmount") {
      const rows = await db.qcfOpportunity.findMany({
        where: where as Prisma.QcfOpportunityWhereInput,
        select: { createdAt: true, amount: true },
        take: DATE_FETCH_CAP,
      });
      for (const r of rows) add(r.createdAt, toNumber(r.amount ?? 0));
    } else {
      const rows = await db.qcfOpportunity.findMany({
        where: where as Prisma.QcfOpportunityWhereInput,
        select: { createdAt: true },
        take: DATE_FETCH_CAP,
      });
      for (const r of rows) add(r.createdAt, 1);
    }
  } else if (object === "activities") {
    const rows = await db.qcfActivity.findMany({
      where: where as Prisma.QcfActivityWhereInput,
      select: { occurredAt: true },
      take: DATE_FETCH_CAP,
    });
    for (const r of rows) add(r.occurredAt, 1);
  } else {
    if (metric === "sumDuration") {
      const rows = await db.qcfCallLog.findMany({
        where: where as Prisma.QcfCallLogWhereInput,
        select: { createdAt: true, durationSec: true },
        take: DATE_FETCH_CAP,
      });
      for (const r of rows) add(r.createdAt, Number(r.durationSec ?? 0));
    } else {
      const rows = await db.qcfCallLog.findMany({
        where: where as Prisma.QcfCallLogWhereInput,
        select: { createdAt: true },
        take: DATE_FETCH_CAP,
      });
      for (const r of rows) add(r.createdAt, 1);
    }
  }

  const isAvg = metric === "avgScore";
  // Chronological order so the trend reads left → right.
  return [...acc.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, { sum, count }]) => ({
      dimension: key,
      value: isAvg ? roundTo1(sum / count) : sum,
    }));
}

function resolveChartType(
  chartType: CustomReportChartType | undefined,
  isDateBucket: boolean,
  rowCount: number,
): "bar" | "line" | "pie" {
  if (chartType && chartType !== "auto") return chartType;
  if (isDateBucket) return "line";
  return rowCount > 8 ? "bar" : "pie";
}

// ---------------------------------------------------------------------------

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

  const filterConds = buildFilterConditions(definition.object, definition.filters);
  const isDateBucket = definition.groupBy.startsWith("date:");
  const grain = isDateBucket ? definition.groupBy.slice("date:".length) : "";

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

  if (isDateBucket) {
    let where: unknown;
    if (definition.object === "leads") {
      where = withFilters(await leadWhere(ctx), filterConds);
    } else if (definition.object === "opportunities") {
      where = withFilters(await opportunityWhere(ctx), filterConds);
    } else if (definition.object === "activities") {
      where = withFilters(activityWhere(ctx), filterConds);
    } else {
      where = withFilters(callLogWhere(ctx), filterConds);
    }
    rows = await runDateBucket(
      definition.object,
      where,
      grain,
      definition.metric,
      ctx.tz,
    );
  } else if (definition.object === "leads") {
    const where = withFilters(await leadWhere(ctx), filterConds);
    if (definition.metric === "avgScore") {
      const grouped = await db.qcfLead.groupBy({
        by: [definition.groupBy as "source"],
        where,
        _avg: { score: true },
      });
      rows = grouped.map((g) => ({
        [dimKey]: bucketLabel((g as Record<string, unknown>)[definition.groupBy]),
        [valueKey]: roundTo1(g._avg.score ?? 0),
      }));
    } else if (definition.metric === "sumScore") {
      const grouped = await db.qcfLead.groupBy({
        by: [definition.groupBy as "source"],
        where,
        _sum: { score: true },
      });
      rows = grouped.map((g) => ({
        [dimKey]: bucketLabel((g as Record<string, unknown>)[definition.groupBy]),
        [valueKey]: g._sum.score ?? 0,
      }));
    } else {
      const grouped = await db.qcfLead.groupBy({
        by: [definition.groupBy as "source"],
        where,
        _count: { _all: true },
      });
      rows = grouped.map((g) => ({
        [dimKey]: bucketLabel((g as Record<string, unknown>)[definition.groupBy]),
        [valueKey]: g._count._all,
      }));
    }
  } else if (definition.object === "opportunities") {
    const where = withFilters(await opportunityWhere(ctx), filterConds);
    if (definition.metric === "sumAmount") {
      const grouped = await db.qcfOpportunity.groupBy({
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
      const grouped = await db.qcfOpportunity.groupBy({
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
    const where = withFilters(activityWhere(ctx), filterConds);
    const grouped = await db.qcfActivity.groupBy({
      by: [definition.groupBy as "type"],
      where,
      _count: { _all: true },
    });
    rows = grouped.map((g) => ({
      [dimKey]: bucketLabel((g as Record<string, unknown>)[definition.groupBy]),
      [valueKey]: g._count._all,
    }));
  } else {
    const where = withFilters(callLogWhere(ctx), filterConds);
    if (definition.metric === "sumDuration") {
      const grouped = await db.qcfCallLog.groupBy({
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
      const grouped = await db.qcfCallLog.groupBy({
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

  // Owner/agent group-bys bucket on a user id — swap the raw UUID for the
  // person's name so the report reads like the canned owner reports do.
  if (!isDateBucket && USER_REF_GROUP_BYS.has(definition.groupBy)) {
    const names = await resolveUserNames(ctx.orgId);
    rows = rows.map((r) => {
      const id = String(r[dimKey] ?? "");
      // Null/empty owner → friendlier than the generic "(blank)" bucket.
      if (id === "(blank)") return { ...r, [dimKey]: "(Unassigned)" };
      const name = names.get(id);
      return name ? { ...r, [dimKey]: name } : r;
    });
  }

  // Date buckets stay chronological; categorical breakdowns sort by value.
  if (!isDateBucket) {
    rows.sort((a, b) => Number(b[valueKey] ?? 0) - Number(a[valueKey] ?? 0));
  }

  // Sum-of-averages is meaningless, so the footer total is omitted for avg.
  const total =
    definition.metric === "avgScore"
      ? undefined
      : {
          label: valueLabel,
          value: rows.reduce((s, r) => s + Number(r[valueKey] ?? 0), 0),
        };

  return {
    definition,
    columns: [
      { key: dimKey, label: dimLabel },
      { key: valueKey, label: valueLabel, align: "right", format: valueFormat },
    ],
    rows,
    total,
    chart: {
      type: resolveChartType(definition.chartType, isDateBucket, rows.length),
      xKey: dimKey,
      yKey: valueKey,
    },
  };
}
