/**
 * Post-generation validation for the Daily Huddle Weekly Report.
 *
 * The deterministic layer guarantees the TABLES are right. This module guards
 * the part that can still go wrong: the AI's prose. Every check is a pure
 * function over (computed data, AI output) and answers one question the client
 * explicitly asked — "did the AI mix up which blocker or which behaviour
 * belongs to which person?"
 *
 * Severity contract:
 *   ERROR   — a rule from the requirement doc was broken, or the AI referenced
 *             something that does not exist. The report stays Draft.
 *   WARNING — suspicious but legitimately possible (an external party in a
 *             blocker, a percentage we can't trace). Shown, not blocking.
 *   INFO    — advisory, e.g. an item below the confidence threshold.
 *
 * Nothing here mutates the report. The route persists the result alongside it
 * so a reviewer sees exactly what was checked.
 */

import { normalizeName, resolveParticipant, type RosterMember } from "./weeklyHuddleAggregate";
import type { AdherenceHeatMap, AttendanceMatrix, ExecutiveMetrics, UnrecognizedSpeaker, WeekBlocker } from "./weeklyHuddleAggregate";
import type { WeeklyReportAi } from "./weeklyHuddleReport";

export type ValidationSeverity = "ERROR" | "WARNING" | "INFO";

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  /** Human-readable, shown in the report's validation panel. */
  message: string;
  /** Which part of the report the issue sits in. */
  location: string;
}

export interface ValidationResult {
  /** True when nothing at ERROR severity fired. */
  passed: boolean;
  issues: ValidationIssue[];
  counts: { errors: number; warnings: number; infos: number };
}

export interface ValidateInput {
  roster: RosterMember[];
  weekStart: string;
  weekEnd: string;
  metrics: ExecutiveMetrics;
  attendance: AttendanceMatrix;
  heatMap: AdherenceHeatMap;
  blockers: WeekBlocker[];
  unrecognized: UnrecognizedSpeaker[];
  ai: WeeklyReportAi;
  /** Items at or below this confidence are flagged INFO. Default 0.4. */
  lowConfidenceThreshold?: number;
}

/** Members who attended under half the huddles held — the only people the
 *  executive summary is permitted to name (requirement doc §4.2). */
function subFiftyAttendance(attendance: AttendanceMatrix): Set<string> {
  const out = new Set<string>();
  for (const row of attendance.rows) {
    // expectedDays is 0 for OPTIONAL/EXTERNAL members, so they are excluded
    // here automatically — the executive summary may only name someone whose
    // attendance is actually being measured.
    if (row.expectedDays > 0 && row.attendancePct !== null && row.attendancePct < 50) {
      out.add(normalizeName(row.name));
    }
  }
  return out;
}

/** Word-boundary search for a roster member's name in free prose. Matches the
 *  full name, or the first name when that first name is unique in the roster
 *  (so "Rahul" is attributable but an ambiguous "Amit" is not). */
function findNamedMembers(text: string, roster: RosterMember[]): string[] {
  const firstNameCounts = new Map<string, number>();
  for (const m of roster) {
    const first = normalizeName(m.name).split(" ")[0];
    firstNameCounts.set(first, (firstNameCounts.get(first) ?? 0) + 1);
  }

  const hit: string[] = [];
  for (const m of roster) {
    const full = normalizeName(m.name);
    const first = full.split(" ")[0];
    const needles = [full];
    if (firstNameCounts.get(first) === 1 && first !== full) needles.push(first);

    const found = needles.some((n) => {
      const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "i").test(normalizeName(text));
    });
    if (found) hit.push(m.name);
  }
  return hit;
}

/** Every distinct percentage figure the computed layer legitimately supports. */
function knownPercentages(input: ValidateInput): number[] {
  const { metrics, attendance, heatMap } = input;
  const vals: (number | null | undefined)[] = [
    metrics.averageAttendancePct,
    metrics.startedOnTimePct,
    heatMap.teamAverage.achievementPct,
    heatMap.teamAverage.focusPct,
    heatMap.teamAverage.stuckPct,
    ...attendance.rows.map((r) => r.attendancePct),
    ...heatMap.rows.flatMap((r) => [r.achievementPct, r.focusPct, r.stuckPct, r.avgScorePct]),
  ];
  return vals.filter((n): n is number => typeof n === "number");
}

const PERCENT_RE = /(\d+(?:\.\d+)?)\s*%/g;
const CROSS_WEEK_RE = /\b(last|previous|prior)\s+(week|month|quarter)\b|\bweek[- ]over[- ]week\b|\bcompared (?:to|with) (?:last|the previous)\b/i;

/**
 * Run every check against a generated report.
 *
 * Ordered most-severe-first within each family so the validation panel reads
 * top-down in the order a reviewer would care about.
 */
export function validateWeeklyReport(input: ValidateInput): ValidationResult {
  const { roster, weekStart, weekEnd, blockers, unrecognized, ai } = input;
  const threshold = input.lowConfidenceThreshold ?? 0.4;
  const issues: ValidationIssue[] = [];

  const inWeek = (d: string) => d >= weekStart && d <= weekEnd;
  const observations = Object.entries(ai.facilitatorObservations);

  // --- 3. Roster containment -----------------------------------------------
  // Every name the AI claims to have used must resolve to a roster member.
  for (const [key, obs] of observations) {
    for (const name of obs.namedMembers) {
      const res = resolveParticipant(name, roster);
      if (!res.memberId) {
        issues.push({
          code: "UNKNOWN_MEMBER_NAMED",
          severity: "ERROR",
          message: `Observation names "${name}", who is not on the client roster (${res.reason}).`,
          location: `facilitatorObservations.${key}`,
        });
      }
    }
    // Catch a name written into the prose but omitted from `namedMembers` —
    // otherwise the roster check above could be trivially bypassed.
    for (const found of findNamedMembers(obs.text, roster)) {
      const declared = obs.namedMembers.some(
        (n) => resolveParticipant(n, roster).canonicalName === found,
      );
      if (!declared) {
        issues.push({
          code: "UNDECLARED_MEMBER_NAMED",
          severity: "WARNING",
          message: `Observation mentions "${found}" in its text but omits them from namedMembers, so attribution could not be verified.`,
          location: `facilitatorObservations.${key}`,
        });
      }
    }
  }

  // --- 4. Attribution integrity --------------------------------------------
  // A blocker attributed to someone who does not exist is the exact failure
  // mode the client called out. External parties are legitimate, hence WARNING.
  for (const [i, b] of blockers.entries()) {
    for (const [field, value] of [
      ["raisedBy", b.raisedBy],
      ["raisedFor", b.raisedFor],
    ] as const) {
      if (!value) continue;
      if (!resolveParticipant(value, roster).memberId) {
        issues.push({
          code: "BLOCKER_UNKNOWN_PERSON",
          severity: "WARNING",
          message: `Stuck #${i + 1} has ${field} "${value}", who is not on the roster — confirm this is an external party and not a misattribution.`,
          location: `stucks.all[${i}]`,
        });
      }
    }
  }

  // --- 5. Numeric consistency ----------------------------------------------
  const known = knownPercentages(input);
  const proseBlocks: { text: string; location: string }[] = [
    ...ai.keyHighlights.map((t, i) => ({ text: t, location: `executive.keyHighlights[${i}]` })),
    ...observations.map(([k, o]) => ({ text: o.text, location: `facilitatorObservations.${k}` })),
  ];
  for (const block of proseBlocks) {
    for (const m of block.text.matchAll(PERCENT_RE)) {
      const value = Number(m[1]);
      if (!known.some((k) => Math.abs(k - value) <= 0.5)) {
        issues.push({
          code: "UNTRACEABLE_PERCENTAGE",
          severity: "WARNING",
          message: `"${value}%" does not match any computed figure for this week — verify it against the tables.`,
          location: block.location,
        });
      }
    }
  }

  // --- 6. Scope containment ------------------------------------------------
  for (const [key, obs] of observations) {
    for (const d of obs.sourceDates) {
      if (!inWeek(d)) {
        issues.push({
          code: "DATE_OUT_OF_WEEK",
          severity: "ERROR",
          message: `Observation cites ${d}, which is outside the reporting week ${weekStart} to ${weekEnd}.`,
          location: `facilitatorObservations.${key}`,
        });
      }
    }
  }
  for (const block of proseBlocks) {
    if (CROSS_WEEK_RE.test(block.text)) {
      issues.push({
        code: "CROSS_WEEK_COMPARISON",
        severity: "ERROR",
        message: "Text compares against another period; the weekly report must cover this week only.",
        location: block.location,
      });
    }
  }

  // --- 7. Executive-summary naming rule ------------------------------------
  const allowed = subFiftyAttendance(input.attendance);
  for (const [i, highlight] of ai.keyHighlights.entries()) {
    for (const name of findNamedMembers(highlight, roster)) {
      if (!allowed.has(normalizeName(name))) {
        issues.push({
          code: "EXEC_SUMMARY_NAMES_MEMBER",
          severity: "ERROR",
          message: `Key highlight names "${name}", whose attendance is not below 50% — the executive summary must stay team-level.`,
          location: `executive.keyHighlights[${i}]`,
        });
      }
    }
  }

  // --- Recurring-stuck grouping integrity ----------------------------------
  for (const [i, group] of ai.recurringStucks.entries()) {
    for (const idx of group.blockerIndexes) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= blockers.length) {
        issues.push({
          code: "RECURRING_INDEX_INVALID",
          severity: "ERROR",
          message: `Recurring stuck "${group.blocker}" cites blocker #${idx}, which does not exist.`,
          location: `stucks.recurring[${i}]`,
        });
      }
    }
    if (group.blockerIndexes.length && group.occurrences !== group.blockerIndexes.length) {
      issues.push({
        code: "RECURRING_COUNT_MISMATCH",
        severity: "WARNING",
        message: `Recurring stuck "${group.blocker}" reports ${group.occurrences} occurrences but cites ${group.blockerIndexes.length} source stucks.`,
        location: `stucks.recurring[${i}]`,
      });
    }
    if (group.occurrences < 2) {
      issues.push({
        code: "RECURRING_NOT_RECURRING",
        severity: "WARNING",
        message: `"${group.blocker}" is listed as recurring but reports only ${group.occurrences} occurrence.`,
        location: `stucks.recurring[${i}]`,
      });
    }
  }

  // --- 8. WWW traceability -------------------------------------------------
  for (const [i, w] of ai.wwwSuggestions.entries()) {
    if (!w.sourceDate && !w.sourceQuote) {
      issues.push({
        code: "WWW_UNTRACEABLE",
        severity: "WARNING",
        message: `WWW suggestion "${w.what}" carries neither a source date nor a source quote.`,
        location: `wwwSuggestions[${i}]`,
      });
    }
    if (w.sourceDate && !inWeek(w.sourceDate)) {
      issues.push({
        code: "DATE_OUT_OF_WEEK",
        severity: "ERROR",
        message: `WWW suggestion "${w.what}" cites ${w.sourceDate}, outside the reporting week.`,
        location: `wwwSuggestions[${i}]`,
      });
    }
    if (w.who && !resolveParticipant(w.who, roster).memberId) {
      issues.push({
        code: "WWW_UNKNOWN_OWNER",
        severity: "WARNING",
        message: `WWW suggestion "${w.what}" is owned by "${w.who}", who is not on the roster.`,
        location: `wwwSuggestions[${i}]`,
      });
    }
    // --- 9. Confidence gating ---------------------------------------------
    if (w.confidence <= threshold) {
      issues.push({
        code: "LOW_CONFIDENCE",
        severity: "INFO",
        message: `WWW suggestion "${w.what}" has low confidence (${Math.round(w.confidence * 100)}%); left unchecked by default.`,
        location: `wwwSuggestions[${i}]`,
      });
    }
  }

  // --- Data-quality carry-through ------------------------------------------
  // When most speakers cannot be matched, the roster is incomplete rather than
  // the transcript being odd — and the adherence table is then near-empty and
  // misleading. Say that once, plainly, instead of leaving the reader to infer
  // it from a pile of per-speaker warnings.
  const matched = input.heatMap.rows.length;
  if (unrecognized.length && unrecognized.length >= matched) {
    issues.push({
      code: "ROSTER_LIKELY_INCOMPLETE",
      severity: "ERROR",
      message: `${unrecognized.length} of ${unrecognized.length + matched} speakers could not be matched to the client roster (${roster.length} member${roster.length === 1 ? "" : "s"}). Add the missing people under Client Members — the adherence and attendance tables cover only matched members.`,
      location: "heatMap",
    });
  }

  for (const u of unrecognized) {
    issues.push({
      code: "UNRECOGNIZED_SPEAKER",
      severity: "WARNING",
      message: `Transcript speaker "${u.name}" (${u.reason}) could not be matched to the roster and was excluded from the adherence table${
        u.days > 1 ? ` on ${u.days} days` : ""
      }.`,
      location: "heatMap.unrecognized",
    });
  }

  if (ai.keyHighlights.length < 3 || ai.keyHighlights.length > 5) {
    issues.push({
      code: "HIGHLIGHT_COUNT",
      severity: "WARNING",
      message: `Executive summary has ${ai.keyHighlights.length} highlights; the format expects 3 to 5.`,
      location: "executive.keyHighlights",
    });
  }

  const counts = {
    errors: issues.filter((i) => i.severity === "ERROR").length,
    warnings: issues.filter((i) => i.severity === "WARNING").length,
    infos: issues.filter((i) => i.severity === "INFO").length,
  };

  return { passed: counts.errors === 0, issues, counts };
}
