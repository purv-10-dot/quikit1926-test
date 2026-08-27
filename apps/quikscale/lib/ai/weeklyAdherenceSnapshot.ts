/**
 * §4 — the WEEKLY Adherence Snapshot.
 *
 * The shared deliverable opens its adherence section with a Yes/Partial/No
 * table per participant, a Score out of 3 and an overall Rating. The daily
 * report has always had one; the weekly rollup jumped straight to percentages.
 * This derives the same table for a week.
 *
 * DERIVED, NEVER REGENERATED
 * --------------------------
 * Every input is already in the stored report: `buildAdherenceHeatMap` folded
 * each day's YES/PARTIAL/NO into per-dimension percentages via `scoreRating`.
 * So this is a pure read over `AdherenceHeatMap` — no prompt, no model call, no
 * schema or promptVersion bump, and every weekly report already in the database
 * gains the section without anyone pressing Regenerate.
 *
 * WHY THE MODEL DOES NOT PRODUCE THESE
 * ------------------------------------
 * The daily report takes `score` and `rating` from the model. A week's figures
 * are arithmetic over days we already scored, and the app rule is explicit:
 * deterministic code owns every number. Every threshold in this file is the
 * single place either value is decided.
 *
 * A WEEKLY FLAG SUMMARISES DAYS, IT IS NOT A DAY
 * ----------------------------------------------
 * Yes/Yes/No across three huddles is 66.7% and reads **Partial** for the week.
 * That is a statement about the week, not about any single huddle — the report
 * says so under the table, because a reader who assumes otherwise would draw a
 * conclusion the data does not support.
 *
 * SCORE COMES FROM `avgScorePct`, NOT FROM THE FLAGS
 * -------------------------------------------------
 * Re-deriving it from the three thresholded flags would round twice and could
 * disagree with the Avg Score the heat map prints one table below. One
 * derivation, one number.
 */

import type { AdherenceHeatMap, HeatMapRow } from "@/lib/ai/weeklyHuddleAggregate";

/** How a dimension reads over the week. `null` = never assessed. */
export type SnapshotFlag = "YES" | "PARTIAL" | "NO";

/** The overall band for a participant's week. */
export type SnapshotRating = "Full" | "Good" | "Partial" | "Poor";

export interface SnapshotRow {
  memberId: string | null;
  participant: string;
  role: string | null;
  achievement: SnapshotFlag | null;
  focus: SnapshotFlag | null;
  stuck: SnapshotFlag | null;
  /** Score out of 3, one decimal at most: 3, 2.5, 2 … Null when unassessed. */
  score: number | null;
  /** Pre-formatted for display, e.g. "2.5/3". Null when unassessed. */
  scoreLabel: string | null;
  rating: SnapshotRating | null;
  daysAssessed: number;
  /** Heard in the transcript but absent from the client roster. */
  unmapped: boolean;
}

export interface SnapshotTiles {
  full: number;
  good: number;
  partial: number;
  poor: number;
  /** Roster members in the table — the denominator the tiles describe. */
  total: number;
}

export interface WeeklyAdherenceSnapshot {
  rows: SnapshotRow[];
  tiles: SnapshotTiles;
}

/**
 * A dimension's week percentage → its flag.
 *
 * Only a clean 100 earns YES: a member who answered on three days out of four
 * did not fully adhere, and rounding that up is the kind of flattery that makes
 * a report useless for coaching.
 */
export function flagFor(pct: number | null | undefined): SnapshotFlag | null {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
  if (pct >= 100) return "YES";
  if (pct <= 0) return "NO";
  return "PARTIAL";
}

/**
 * `avgScorePct` → a score out of 3.
 *
 * Rounded to one decimal so 83% reads "2.5/3" rather than "2.4900000000000002/3".
 */
export function scoreOutOfThree(avgScorePct: number | null | undefined): number | null {
  if (avgScorePct === null || avgScorePct === undefined || !Number.isFinite(avgScorePct)) {
    return null;
  }
  return Math.round(((avgScorePct * 3) / 100) * 10) / 10;
}

/**
 * `avgScorePct` → the overall band.
 *
 * Bands match the shared deliverable's worked example: 3/3 is Full, and both
 * 2.5/3 (83%) and 2/3 (67%) are Good.
 */
export function ratingFor(avgScorePct: number | null | undefined): SnapshotRating | null {
  if (avgScorePct === null || avgScorePct === undefined || !Number.isFinite(avgScorePct)) {
    return null;
  }
  if (avgScorePct >= 100) return "Full";
  if (avgScorePct >= 67) return "Good";
  if (avgScorePct >= 34) return "Partial";
  return "Poor";
}

/** Display label for a flag. Shared by the screen, the PDF and the DOCX. */
export const SNAPSHOT_FLAG_LABEL: Record<SnapshotFlag, string> = {
  YES: "Yes",
  PARTIAL: "Partial",
  NO: "No",
};

const toRow = (row: HeatMapRow): SnapshotRow => {
  const score = scoreOutOfThree(row.avgScorePct);
  return {
    memberId: row.memberId,
    participant: row.participant,
    role: row.role,
    achievement: flagFor(row.achievementPct),
    focus: flagFor(row.focusPct),
    stuck: flagFor(row.stuckPct),
    score,
    scoreLabel: score === null ? null : `${score}/3`,
    rating: ratingFor(row.avgScorePct),
    daysAssessed: row.daysAssessed,
    // The heat map already encodes this: an unmapped speaker has no member id.
    unmapped: row.memberId === null,
  };
};

/**
 * Build the snapshot from the stored heat map.
 *
 * Row order is the heat map's, which is roster order followed by unmapped
 * speakers — stable across regenerations, and the same order the table one
 * section below uses, so a reader can compare the two line by line.
 *
 * Unmapped speakers are shown but excluded from the tiles, exactly as they are
 * already excluded from the heat map's Team Average. Letting them count would
 * silently redefine "Total Attendees" the moment the roster has a gap, and make
 * this week incomparable with last week's.
 */
export function buildWeeklyAdherenceSnapshot(
  heatMap: Pick<AdherenceHeatMap, "rows"> | null | undefined,
): WeeklyAdherenceSnapshot {
  const rows = (heatMap?.rows ?? []).map(toRow);

  const tiles: SnapshotTiles = { full: 0, good: 0, partial: 0, poor: 0, total: 0 };
  for (const row of rows) {
    if (row.unmapped) continue;
    tiles.total += 1;
    if (row.rating === "Full") tiles.full += 1;
    else if (row.rating === "Good") tiles.good += 1;
    else if (row.rating === "Partial") tiles.partial += 1;
    else if (row.rating === "Poor") tiles.poor += 1;
  }

  return { rows, tiles };
}
