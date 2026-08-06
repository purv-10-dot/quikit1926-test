/**
 * Canned reports — Activities category.
 *
 * Note: `CrmActivity` rows can relate to leads, opportunities, contacts,
 * or stand alone. Account ACL inheritance through the relation graph is
 * a Phase 5 concern (the existing `/api/activities` JSON branch also
 * skips ACL, so Phase 2 matches that behaviour for consistency).
 */
import { db } from "@/lib/db";
import type { CannedReport } from "./types";

const activitiesByType: CannedReport = {
  id: "activities-by-type",
  category: "Activities",
  title: "Activities by type",
  blurb: "Activity count grouped by type over the selected window.",
  helpText:
    "Counts activity rows by their `type` field (Call, Note, Email, etc.). " +
    "Filtered by `occurredAt` between the selected date range. " +
    "Sorted by count descending. Use to see what kinds of work the team logs.",
  defaultDateRange: "30d",
  buildDrillUrl: (row) => {
    const type = String(row.type ?? "");
    return type ? `/activities?type=${encodeURIComponent(type)}` : null;
  },
  async run(ctx) {
    const grouped = await db.crmActivity.groupBy({
      by: ["type"],
      where: {
        tenantId: ctx.tenantId,
        occurredAt: { gte: ctx.from, lte: ctx.to },
        ...(ctx.ownerId ? { ownerId: ctx.ownerId } : {}),
      },
      _count: { _all: true },
    });
    const rows = grouped
      .map((g) => ({ type: g.type, count: g._count?._all ?? 0 }))
      .sort((a, b) => b.count - a.count);
    const total = rows.reduce((s, r) => s + r.count, 0);
    return {
      columns: [
        { key: "type", label: "Type" },
        { key: "count", label: "Count", align: "right", format: "number" },
      ],
      rows,
      total: { label: "Total activities", value: total },
      chart: { type: "bar", xKey: "type", yKey: "count" },
    };
  },
};

const activityLeaderboard: CannedReport = {
  id: "activity-leaderboard",
  category: "Activities",
  title: "Activity leaderboard",
  blurb: "Activities logged per user over the selected window.",
  helpText:
    "Counts activity rows per `ownerName`, filtered by `occurredAt` between the " +
    "selected date range (defaults to the last 7 days). Sorted by count descending. " +
    "Useful to spot who's logging activity consistently vs. who's gone quiet.",
  defaultDateRange: "7d",
  buildDrillUrl: (row) => {
    const ownerId = row.ownerId ? String(row.ownerId) : "";
    return ownerId ? `/activities?ownerId=${encodeURIComponent(ownerId)}` : null;
  },
  async run(ctx) {
    const grouped = await db.crmActivity.groupBy({
      by: ["ownerId", "ownerName"],
      where: {
        tenantId: ctx.tenantId,
        occurredAt: { gte: ctx.from, lte: ctx.to },
        ...(ctx.ownerId ? { ownerId: ctx.ownerId } : {}),
      },
      _count: { _all: true },
    });
    const rows = grouped
      .map((g) => ({
        ownerId: g.ownerId,
        ownerName: g.ownerName ?? "(unknown)",
        count: g._count?._all ?? 0,
      }))
      .sort((a, b) => b.count - a.count);
    const total = rows.reduce((s, r) => s + r.count, 0);
    return {
      columns: [
        { key: "ownerName", label: "User" },
        { key: "count", label: "Activities", align: "right", format: "number" },
      ],
      rows,
      total: { label: "Total activities", value: total },
      chart: { type: "bar", xKey: "ownerName", yKey: "count" },
    };
  },
};

export const ACTIVITY_REPORTS: CannedReport[] = [
  activitiesByType,
  activityLeaderboard,
];
