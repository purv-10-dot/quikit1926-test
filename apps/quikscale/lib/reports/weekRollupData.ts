/**
 * Loading one Week Rollup's sources.
 *
 * Six indexed row reads and a WWW query. No transcript, no fact table, no
 * segment — every input is a stored report's `metrics` and `factSet` columns,
 * which is what makes this rollup cost the same whether the week held a
 * twenty-minute huddle or a six-hour weekly meeting.
 */

import { db } from "@/lib/db";
import { buildWwwScopeWhere } from "@/lib/api/wwwListQuery";

import { readFactSet } from "./factSet";
import { listReports } from "./reportStore";
import {
  weekBounds,
  weekLabel,
  TRAILING_WEEKS,
  type RollupSource,
  type WeekRollupContext,
} from "./weekRollupCompose";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Load the week.
 *
 * Returns null only when the client does not exist or the week is unparseable.
 * A week with NO reports is a legitimate context, not an error — the rollup
 * says so, which is a different and more useful statement than refusing to
 * generate.
 */
export async function loadWeekRollupContext(
  ctx: { orgId: string; userId: string },
  clientId: string,
  weekStart: string,
): Promise<WeekRollupContext | null> {
  const bounds = weekBounds(weekStart);
  if (!bounds) return null;

  const client = await db.client.findFirst({
    where: { id: clientId, orgId: ctx.orgId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!client) return null;

  // The trailing window for week-over-week movement. Read from the weekly
  // reports that already exist rather than from previous rollups, so the first
  // rollup for a client still has history.
  const historyStart = new Date(bounds.start);
  historyStart.setUTCDate(historyStart.getUTCDate() - 7 * (TRAILING_WEEKS - 1));

  const [thisWeek, history, wwwItems] = await Promise.all([
    // Both rhythms in ONE indexed read. "Everything that happened this week" is
    // the question this rollup exists to answer, and since the report tables
    // were merged it is also literally the query.
    listReports(ctx.orgId, clientId, {
      kinds: ["DH_WEEKLY", "WM"],
      from: bounds.start,
      to: bounds.end,
    }),
    listReports(ctx.orgId, clientId, {
      kinds: ["DH_WEEKLY"],
      from: historyStart,
      to: bounds.start,
    }),
    // Row-level visibility applies here too. A rollup must not become a way to
    // count commitments the reader cannot see individually.
    buildWwwScopeWhere(ctx, {}).then((scope) =>
      db.wWWItem.findMany({
        where: {
          ...scope,
          createdAt: { lte: bounds.end },
          OR: [
            { status: { notIn: ["completed", "not-applicable"] } },
            { completedAt: { gte: bounds.start, lte: bounds.end } },
            { when: { gte: bounds.start, lte: bounds.end } },
          ],
        },
        select: {
          status: true,
          when: true,
          dueDateTBD: true,
          revisedDates: true,
          completedAt: true,
          createdAt: true,
        },
      }),
    ),
  ]);

  // Daily huddles first, then each weekly meeting by date — the order a reader
  // expects, and stable so a regenerated rollup does not reshuffle itself.
  const sources: RollupSource[] = thisWeek
    .slice()
    .sort(
      (a, b) =>
        (a.reportKind === "DH_WEEKLY" ? 0 : 1) - (b.reportKind === "DH_WEEKLY" ? 0 : 1) ||
        a.periodStart.getTime() - b.periodStart.getTime(),
    )
    .map((r) => ({
      id: r.id,
      kind: r.reportKind === "DH_WEEKLY" ? ("DH_WEEKLY" as const) : ("WM" as const),
      label: r.reportKind === "DH_WEEKLY" ? "Daily huddles" : "Weekly meeting",
      date: ymd(r.periodStart),
      metrics: (r.metrics as Record<string, unknown> | null) ?? null,
      factSet: readFactSet(r.factSet),
      currentVersion: r.currentVersion,
    }));

  return {
    client,
    weekStart: bounds.start,
    weekEnd: bounds.end,
    label: weekLabel(bounds.start, bounds.end),
    sources,
    history: history.map((h) => ({
      label: ymd(h.periodStart).slice(5),
      metrics: (h.metrics as Record<string, unknown> | null) ?? null,
    })),
    wwwItems,
  };
}

/** Everything the fingerprint needs: which reports, at which versions. */
export function weekRollupSources(context: WeekRollupContext): {
  sourceReports: { reportId: string; kind: string; version: number }[];
  dhWeeklyReportId: string | null;
  wmReportIds: string[];
} {
  return {
    sourceReports: context.sources.map((s) => ({
      reportId: s.id,
      kind: s.kind,
      version: s.currentVersion,
    })),
    dhWeeklyReportId: context.sources.find((s) => s.kind === "DH_WEEKLY")?.id ?? null,
    wmReportIds: context.sources.filter((s) => s.kind === "WM").map((s) => s.id),
  };
}
