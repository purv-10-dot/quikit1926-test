/**
 * The Weekly Meeting scorecard.
 *
 * The ten process metrics from the reference report
 * (`Weekly_Meeting_Report-SA_16_Jun_26.pdf`), computed rather than judged:
 *
 *    1 Call happened                              6 WWW review and follow-up
 *    2 Call punctuality                           7 Customer / employee feedback
 *    3 End-time adherence                         8 Collective intelligence
 *    4 Quality of the dashboards                  9 OPSP review
 *    5 K&P gaps + action plan discussion         10 People attending the call
 *                          Overall meeting health
 *
 * EVERY RAG HERE IS DERIVED
 * -------------------------
 * Each reads off attendance, timing, or the segment-coverage table — all of
 * which are themselves computed. No model produces a colour. That matters
 * because these are the numbers a client is scored on week to week, and an LLM
 * that drifts half a grade would be invisible and cumulative.
 *
 * The one metric that cannot be fully derived is #4, dashboard quality — the
 * reference report's own entry reads "Good, minor data issues", which is a
 * human judgement about data integrity. It is computed from what IS observable
 * (how many coaches' dashboards were actually reviewed) and flagged as
 * `derivedProxy`, so nobody mistakes a coverage proxy for a quality assessment.
 */

import type { SegmentAdherenceResult } from "./segmentAdherence";

export type Rag = "GREEN" | "AMBER" | "RED" | "UNKNOWN";

export interface ScorecardMetric {
  n: number;
  label: string;
  /** Human-readable reading, matching the reference report's middle column. */
  reading: string;
  rag: Rag;
  /**
   * True when this is a proxy rather than a direct measure — currently only
   * dashboard quality. Renders with a caveat rather than as fact.
   */
  derivedProxy?: boolean;
}

export interface ScorecardResult {
  metrics: ScorecardMetric[];
  overall: { reading: string; rag: Rag };
  counts: { green: number; amber: number; red: number; unknown: number };
}

/**
 * Attendance thresholds, from the reference report's stated scale:
 * ">98% / met 80–90% / partial <80% / not met".
 */
export const ATTENDANCE_GREEN = 90;
export const ATTENDANCE_AMBER = 80;

/** Grace before a start counts as late. Mirrors the daily-huddle rule. */
export const PUNCTUALITY_GRACE_MINUTES = 1;

/** Over-run tolerance before end-time adherence goes red. */
const END_OVERRUN_AMBER_MINUTES = 5;
const END_OVERRUN_RED_MINUTES = 15;

export interface ScorecardInput {
  callHeld: boolean;
  /** Planned and actual, in minutes from midnight. Null when unknown. */
  plannedStartMinutes: number | null;
  actualStartMinutes: number | null;
  plannedEndMinutes: number | null;
  actualEndMinutes: number | null;
  /** An agreed schedule deviation — treats the start as punctual. */
  punctualityOverride?: boolean;
  attendancePct: number | null;
  segments: SegmentAdherenceResult;
  /** How many members' dashboards were reviewed, and how many were expected. */
  dashboardsReviewed?: number | null;
  dashboardsExpected?: number | null;
  /** Gaps captured in the meeting — the input to metric 5. */
  gapCount?: number;
}

const seg = (result: SegmentAdherenceResult, key: string) =>
  result.rows.find((r) => r.key === key) ?? null;

/**
 * RAG for one agenda segment: covered and on time is green, covered but rushed
 * or partial is amber, not covered is red.
 *
 * The reference report grades CI and OPSP red purely for not happening, which
 * is the behaviour this reproduces.
 */
function segmentRag(result: SegmentAdherenceResult, key: string): { rag: Rag; reading: string } {
  const row = seg(result, key);
  if (!row) return { rag: "UNKNOWN", reading: "No signal" };

  if (row.coverage === "NOT_DONE") {
    return { rag: "RED", reading: row.timeDiscipline === "SKIPPED" ? "No — deferred" : "No" };
  }
  if (row.coverage === "UNKNOWN") return { rag: "UNKNOWN", reading: "Unknown" };
  if (row.coverage === "PARTIAL") return { rag: "AMBER", reading: "Partial" };

  if (row.timeDiscipline === "RUSHED") return { rag: "AMBER", reading: "Yes — rushed" };
  if (row.timeDiscipline === "OVER_RAN") return { rag: "AMBER", reading: "Yes — over-ran" };
  return { rag: "GREEN", reading: "Yes" };
}

export function buildScorecard(input: ScorecardInput): ScorecardResult {
  const metrics: ScorecardMetric[] = [];

  // 1 — Call happened.
  metrics.push({
    n: 1,
    label: "Call happened",
    reading: input.callHeld ? "Yes" : "No",
    rag: input.callHeld ? "GREEN" : "RED",
  });

  // 2 — Punctuality.
  metrics.push({ n: 2, label: "Call punctuality (started on time)", ...punctuality(input) });

  // 3 — End-time adherence.
  metrics.push({ n: 3, label: "End-time adherence", ...endTime(input) });

  // 4 — Dashboard quality. A PROXY: see the note at the top of this file.
  metrics.push({ n: 4, label: "Quality of the dashboards", ...dashboardQuality(input) });

  // 5 — K&P gaps and action plan. Coverage of the gaps segment, plus whether
  // any gap was actually captured — a segment that ran but produced nothing is
  // not a discussion.
  const gapsSegment = segmentRag(input.segments, "gaps");
  const gapCount = input.gapCount ?? 0;
  metrics.push({
    n: 5,
    label: "Active discussion on K&P gaps & action plan",
    reading:
      gapsSegment.rag === "RED"
        ? "No"
        : gapCount > 0
          ? `Yes — ${gapCount} gap${gapCount === 1 ? "" : "s"} captured`
          : "Covered, none captured",
    rag: gapsSegment.rag === "RED" ? "RED" : gapCount > 0 ? gapsSegment.rag : "AMBER",
  });

  // 6–9 — the remaining agenda segments.
  metrics.push({ n: 6, label: "WWW review and follow-up", ...segmentRag(input.segments, "www") });
  metrics.push({
    n: 7,
    label: "Customer / employee feedback done",
    ...segmentRag(input.segments, "feedback"),
  });
  metrics.push({
    n: 8,
    label: "Collective intelligence done",
    ...segmentRag(input.segments, "collectiveIntelligence"),
  });
  metrics.push({ n: 9, label: "OPSP review done", ...segmentRag(input.segments, "opspReview") });

  // 10 — Attendance.
  metrics.push({ n: 10, label: "People attending the call", ...attendance(input.attendancePct) });

  return { metrics, overall: overallHealth(metrics), counts: countRags(metrics) };
}

function punctuality(input: ScorecardInput): { reading: string; rag: Rag } {
  if (!input.callHeld) return { reading: "Not held", rag: "RED" };
  if (input.punctualityOverride) {
    // An agreed deviation is not lateness. Scoring it red would punish a team
    // for rescheduling openly.
    return { reading: "Agreed schedule change", rag: "GREEN" };
  }
  if (input.plannedStartMinutes === null || input.actualStartMinutes === null) {
    return { reading: "Start time not recorded", rag: "UNKNOWN" };
  }

  const late = input.actualStartMinutes - input.plannedStartMinutes;
  if (late <= PUNCTUALITY_GRACE_MINUTES) return { reading: "On time", rag: "GREEN" };
  if (late <= 5) return { reading: `${late} min late`, rag: "AMBER" };
  return { reading: `${late} min late`, rag: "RED" };
}

function endTime(input: ScorecardInput): { reading: string; rag: Rag } {
  if (!input.callHeld) return { reading: "Not held", rag: "RED" };
  if (input.plannedEndMinutes === null || input.actualEndMinutes === null) {
    return { reading: "End time not recorded", rag: "UNKNOWN" };
  }

  const over = input.actualEndMinutes - input.plannedEndMinutes;
  if (over <= 0) return { reading: "Ended on time", rag: "GREEN" };
  if (over <= END_OVERRUN_AMBER_MINUTES) return { reading: `${over} min over`, rag: "GREEN" };
  if (over <= END_OVERRUN_RED_MINUTES) return { reading: `${over} min over`, rag: "AMBER" };
  return { reading: `Over-ran by ${over} min`, rag: "RED" };
}

/**
 * Dashboard quality — a COVERAGE proxy, not a quality judgement.
 *
 * The reference report's entry ("Good, minor data issues") is a human reading
 * of data integrity that nothing observable reproduces. What IS observable is
 * how many coaches actually walked their dashboard, so that is what is
 * measured — and flagged as a proxy so the distinction survives into the report.
 */
function dashboardQuality(
  input: ScorecardInput,
): { reading: string; rag: Rag; derivedProxy: boolean } {
  const kp = seg(input.segments, "kpDashboard");
  if (!kp || kp.coverage === "NOT_DONE") {
    return { reading: "Not reviewed", rag: "RED", derivedProxy: true };
  }

  const reviewed = input.dashboardsReviewed ?? null;
  const expected = input.dashboardsExpected ?? null;
  if (reviewed === null || expected === null || expected === 0) {
    return { reading: "Reviewed", rag: "UNKNOWN", derivedProxy: true };
  }

  const pct = Math.round((reviewed / expected) * 100);
  const reading = `${reviewed} of ${expected} dashboards reviewed`;
  if (pct >= 90) return { reading, rag: "GREEN", derivedProxy: true };
  if (pct >= 70) return { reading, rag: "AMBER", derivedProxy: true };
  return { reading, rag: "RED", derivedProxy: true };
}

function attendance(pct: number | null): { reading: string; rag: Rag } {
  if (pct === null) return { reading: "Not recorded", rag: "UNKNOWN" };
  const reading = `${Math.round(pct)}%`;
  if (pct >= ATTENDANCE_GREEN) return { reading, rag: "GREEN" };
  if (pct >= ATTENDANCE_AMBER) return { reading, rag: "AMBER" };
  return { reading, rag: "RED" };
}

/**
 * Overall meeting health.
 *
 * Any red caps the meeting at amber at best, because the reference report's own
 * verdict was "Functional / Amber" on a meeting with three reds and excellent
 * substance. Process failures are what this scorecard measures, and averaging
 * them away would let a meeting that skipped two whole segments read green.
 *
 * UNKNOWN metrics are excluded from the denominator rather than counted as
 * failures — a missing end time is a recording gap, not a badly run meeting.
 */
function overallHealth(metrics: ScorecardMetric[]): { reading: string; rag: Rag } {
  const known = metrics.filter((m) => m.rag !== "UNKNOWN");
  if (known.length === 0) return { reading: "Not enough data", rag: "UNKNOWN" };

  // A meeting that did not happen is red regardless of anything else. No
  // count of the remaining metrics can redeem it, and letting it average out
  // to amber would be absurd.
  if (metrics.find((m) => m.n === 1)?.rag === "RED") {
    return { reading: "Not held", rag: "RED" };
  }

  const red = known.filter((m) => m.rag === "RED").length;
  const amber = known.filter((m) => m.rag === "AMBER").length;

  // CALIBRATED AGAINST THE REFERENCE REPORT, which graded the 16 June meeting
  // "Functional / Amber" on 2 green, 5 amber and THREE reds (end-time over-run,
  // CI not held, OPSP not held). An earlier `red >= 3 ⇒ RED` rule scored that
  // same meeting red, contradicting the document this feature has to
  // reproduce — so the bar for red sits above three.
  //
  // The judgement embedded here is the report's own: a meeting can lose whole
  // segments to an over-running dashboard round and still be a functioning
  // meeting. Red is reserved for one that is failing broadly.
  if (red >= 5) return { reading: "Needs attention", rag: "RED" };
  if (red > 0 || amber >= 3) return { reading: "Functional", rag: "AMBER" };
  if (amber > 0) return { reading: "Good", rag: "GREEN" };
  return { reading: "Strong", rag: "GREEN" };
}

function countRags(metrics: ScorecardMetric[]): ScorecardResult["counts"] {
  const n = (rag: Rag) => metrics.filter((m) => m.rag === rag).length;
  return { green: n("GREEN"), amber: n("AMBER"), red: n("RED"), unknown: n("UNKNOWN") };
}

/** "18:03" → 1083. Null for anything unparseable. */
export function hhmmToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
