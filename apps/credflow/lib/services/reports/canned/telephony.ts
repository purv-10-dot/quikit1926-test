/**
 * Canned reports — Telephony category.
 *
 * `CrmCallLog` ACL inheritance through linked leads / accounts is a
 * Phase 5 concern. Phase 2 keeps these tenant-scoped only, matching the
 * existing `/api/telephony/call-logs` JSON branch behaviour.
 */
import { db } from "@/lib/db";
import { startOfDayInTz } from "./date-ranges";
import type { CannedReport, ReportRunContext } from "./types";

const callsByDisposition: CannedReport = {
  id: "calls-by-disposition",
  category: "Telephony",
  title: "Calls by disposition",
  blurb: "Call count grouped by disposition.",
  helpText:
    "Counts calls by their `dispositionName` (the snapshot stored on the log row, " +
    "so re-edits to the disposition catalog don't retroactively change history). " +
    "Filtered by `createdAt` between the selected date range. Calls without a " +
    "disposition are bucketed as '(none)'.",
  defaultDateRange: "30d",
  buildDrillUrl: (row) => {
    const disposition = String(row.dispositionName ?? "");
    return disposition
      ? `/telephony/call-logs?disposition=${encodeURIComponent(disposition)}`
      : null;
  },
  async run(ctx) {
    const grouped = await db.crmCallLog.groupBy({
      by: ["dispositionName"],
      where: {
        tenantId: ctx.tenantId,
        createdAt: { gte: ctx.from, lte: ctx.to },
        ...(ctx.ownerId ? { agentUserId: ctx.ownerId } : {}),
      },
      _count: { _all: true },
    });
    const rows = grouped
      .map((g) => ({
        dispositionName: g.dispositionName ?? "(none)",
        count: g._count?._all ?? 0,
      }))
      .sort((a, b) => b.count - a.count);
    const total = rows.reduce((s, r) => s + r.count, 0);
    return {
      columns: [
        { key: "dispositionName", label: "Disposition" },
        { key: "count", label: "Calls", align: "right", format: "number" },
      ],
      rows,
      total: { label: "Total calls", value: total },
      chart: { type: "bar", xKey: "dispositionName", yKey: "count" },
    };
  },
};

/**
 * Bucket a Date into a YYYY-MM-DD label in the user's tz.
 */
function dayKeyInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

const callsByDay: CannedReport = {
  id: "calls-by-day",
  category: "Telephony",
  title: "Calls by day",
  blurb: "Daily call volume across the selected window.",
  helpText:
    "Daily call count across the selected date range (defaults to the last 30 days). " +
    "Each day is bucketed in your timezone (midnight to midnight). Empty days are " +
    "pre-filled with zero so the line chart is continuous. Click a row to drill into " +
    "that day's call log.",
  defaultDateRange: "30d",
  buildDrillUrl: (row, ctx) => {
    const day = String(row.day ?? "");
    if (!day) return null;
    // Day-window: midnight-to-midnight in the user's tz.
    const start = new Date(`${day}T00:00:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    const params = new URLSearchParams({
      from: start.toISOString(),
      to: end.toISOString(),
    });
    void ctx;
    return `/telephony/call-logs?${params.toString()}`;
  },
  async run(ctx) {
    const start = startOfDayInTz(ctx.from, ctx.tz);
    const calls = await db.crmCallLog.findMany({
      where: {
        tenantId: ctx.tenantId,
        createdAt: { gte: start, lte: ctx.to },
        ...(ctx.ownerId ? { agentUserId: ctx.ownerId } : {}),
      },
      select: { createdAt: true },
    });
    // Pre-fill one bucket per day across the selected range so the line chart
    // shows zero-days too. Capped at 366 buckets so an over-wide custom range
    // can't produce a pathological chart.
    const dayMs = 24 * 60 * 60 * 1000;
    const endKey = dayKeyInTz(ctx.to, ctx.tz);
    const buckets = new Map<string, number>();
    let cursor = start;
    for (let guard = 0; guard < 366; guard++) {
      const key = dayKeyInTz(cursor, ctx.tz);
      buckets.set(key, 0);
      if (key >= endKey) break;
      cursor = new Date(cursor.getTime() + dayMs);
    }
    for (const c of calls) {
      const k = dayKeyInTz(c.createdAt, ctx.tz);
      buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    const rows = [...buckets.entries()].map(([day, count]) => ({ day, count }));
    const total = rows.reduce((s, r) => s + r.count, 0);
    return {
      columns: [
        { key: "day", label: "Day" },
        { key: "count", label: "Calls", align: "right", format: "number" },
      ],
      rows,
      total: { label: "Total calls", value: total },
      chart: { type: "line", xKey: "day", yKey: "count" },
    };
  },
};

const callsByUser: CannedReport = {
  id: "calls-by-user",
  category: "Telephony",
  title: "Calls by user",
  blurb: "Call count and total talk time per agent over the selected window.",
  helpText:
    "Counts call logs per `agentUserId`, filtered by `createdAt` between the selected " +
    "date range (defaults to the last 7 days), also summing `durationSec` for total " +
    "talk time. Sorted by call count descending. Use to compare dialing volume across " +
    "the team.",
  defaultDateRange: "7d",
  buildDrillUrl: (row) => {
    const agentUserId = row.agentUserId ? String(row.agentUserId) : "";
    return agentUserId
      ? `/telephony/call-logs?ownerId=${encodeURIComponent(agentUserId)}`
      : null;
  },
  async run(ctx) {
    const grouped = await db.crmCallLog.groupBy({
      by: ["agentUserId", "ownerName"],
      where: {
        tenantId: ctx.tenantId,
        createdAt: { gte: ctx.from, lte: ctx.to },
        ...(ctx.ownerId ? { agentUserId: ctx.ownerId } : {}),
      },
      _count: { _all: true },
      _sum: { durationSec: true },
    });
    const rows = grouped
      .map((g) => ({
        agentUserId: g.agentUserId,
        ownerName: g.ownerName ?? "(unknown)",
        count: g._count?._all ?? 0,
        durationSec: g._sum?.durationSec ?? 0,
      }))
      .sort((a, b) => b.count - a.count);
    const total = rows.reduce((s, r) => s + r.count, 0);
    return {
      columns: [
        { key: "ownerName", label: "Agent" },
        { key: "count", label: "Calls", align: "right", format: "number" },
        { key: "durationSec", label: "Talk time", align: "right", format: "duration" },
      ],
      rows,
      total: { label: "Total calls", value: total },
      chart: { type: "bar", xKey: "ownerName", yKey: "count" },
    };
  },
};

const talkTimeByUser: CannedReport = {
  id: "talk-time-by-user",
  category: "Telephony",
  title: "Talk time by user",
  blurb: "Total talk-time per agent over the selected window.",
  helpText:
    "Sums `durationSec` per `agentUserId`, filtered by `createdAt` between the selected " +
    "date range (defaults to the last 7 days). Sorted by total talk time descending. " +
    "Displayed as HH:MM:SS in the table; CSV export keeps the same format.",
  defaultDateRange: "7d",
  buildDrillUrl: (row) => {
    const agentUserId = row.agentUserId ? String(row.agentUserId) : "";
    return agentUserId
      ? `/telephony/call-logs?ownerId=${encodeURIComponent(agentUserId)}`
      : null;
  },
  async run(ctx: ReportRunContext) {
    const grouped = await db.crmCallLog.groupBy({
      by: ["agentUserId", "ownerName"],
      where: {
        tenantId: ctx.tenantId,
        createdAt: { gte: ctx.from, lte: ctx.to },
        ...(ctx.ownerId ? { agentUserId: ctx.ownerId } : {}),
      },
      _sum: { durationSec: true },
    });
    const rows = grouped
      .map((g) => ({
        agentUserId: g.agentUserId,
        ownerName: g.ownerName ?? "(unknown)",
        durationSec: g._sum?.durationSec ?? 0,
      }))
      .sort((a, b) => b.durationSec - a.durationSec);
    const totalSec = rows.reduce((s, r) => s + r.durationSec, 0);
    return {
      columns: [
        { key: "ownerName", label: "Agent" },
        { key: "durationSec", label: "Talk time", align: "right", format: "duration" },
      ],
      rows,
      total: { label: "Total talk time", value: totalSec },
      chart: { type: "bar", xKey: "ownerName", yKey: "durationSec" },
    };
  },
};

export const TELEPHONY_REPORTS: CannedReport[] = [
  callsByDisposition,
  callsByDay,
  callsByUser,
  talkTimeByUser,
];
