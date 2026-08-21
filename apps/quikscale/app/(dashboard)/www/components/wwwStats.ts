/**
 * Aggregate stats for the dashboard "WWW Overview" card — mirrors
 * `computeKpiOverviewStats` (see kpi/components/kpiStats.ts) but WWW items
 * carry no numeric progress field, only a status string. `avg` is therefore a
 * status → % mapping rather than a real Σachieved/Σgoal ratio.
 */

import type { WWWItem } from "@/lib/types/www";
import type { ItemStatus } from "@/lib/constants/status";
import type { FormulaExplain } from "../../kpi/components/kpiFormulaTooltips";

/** Status → completion % used to derive the avg. Not Applicable is excluded entirely. */
export const WWW_STATUS_PCT: Record<Exclude<ItemStatus, "not-applicable">, number> = {
  "completed": 100,
  "on-track": 70,
  "behind-schedule": 30,
  "not-yet-started": 0,
};

export interface WWWOverviewStats {
  /** Rounded mean of `WWW_STATUS_PCT` over every item EXCEPT "not-applicable". */
  avg: number;
  completed: number;
  onTrack: number;
  behindSchedule: number;
  notYetStarted: number;
  /** Excluded from `avg` and the four buckets above, like KPI's `notStarted`. */
  notApplicable: number;
}

export function computeWWWOverviewStats(items: WWWItem[]): WWWOverviewStats {
  let completed = 0;
  let onTrack = 0;
  let behindSchedule = 0;
  let notYetStarted = 0;
  let notApplicable = 0;
  let pctSum = 0;
  let counted = 0;

  for (const item of items) {
    const status = item.status as ItemStatus;
    if (status === "not-applicable") {
      notApplicable += 1;
      continue;
    }
    if (status === "completed") completed += 1;
    else if (status === "on-track") onTrack += 1;
    else if (status === "behind-schedule") behindSchedule += 1;
    else if (status === "not-yet-started") notYetStarted += 1;
    else continue; // unrecognised status — excluded from avg + buckets

    pctSum += WWW_STATUS_PCT[status];
    counted += 1;
  }

  const avg = counted > 0 ? Math.round(pctSum / counted) : 0;
  return { avg, completed, onTrack, behindSchedule, notYetStarted, notApplicable };
}

/** Tooltip explanation for the dashboard "avg WWW" pill. */
export function explainAvgWWW(stats: WWWOverviewStats): FormulaExplain {
  const counted = stats.completed + stats.onTrack + stats.behindSchedule + stats.notYetStarted;
  if (counted === 0) {
    return {
      title: "Avg WWW Completion",
      formula: "Mean of (status → % ) over items with a status other than Not Applicable",
      note: "No items with an applicable status yet.",
    };
  }
  return {
    title: "Avg WWW Completion",
    formula: "Mean of (status → %): Completed=100, On Track=70, Behind Schedule=30, Not Yet Started=0",
    substitution: `(${stats.completed}×100 + ${stats.onTrack}×70 + ${stats.behindSchedule}×30 + ${stats.notYetStarted}×0) ÷ ${counted}`,
    result: `${stats.avg}%`,
    note: `${stats.notApplicable} "Not Applicable" item${stats.notApplicable === 1 ? "" : "s"} excluded.`,
  };
}
