/**
 * Composing the Weekly Meeting report (doc 17 §P6).
 *
 * Eight sections, assembled from facts and human records. Sections 5 and 6 —
 * WWW Review and New WWW — are built by the P7 services and passed in, so this
 * module never queries `WWWItem` and cannot bypass `buildWwwScopeWhere`.
 *
 * WHAT THIS MODULE IS ALLOWED TO DO
 * ---------------------------------
 * Everything numeric. Attendance, coverage, durations, the ten-metric scorecard,
 * RAG counts. The model contributes prose over the finished tables and nothing
 * else — it never sees a transcript, never recomputes a number, and its output
 * is confined to `wmAiSchema`.
 *
 * THE COVERAGE CONTRACT
 * ---------------------
 * A report generated from partial extraction says so in three places: a
 * `completeness` flag, the exact time windows nobody read, and per-section
 * `incompleteCoverage` marks. It also cannot be signed off. A facilitator
 * validating a report is asserting something about the whole meeting, and a
 * report that saw 92% of it cannot support that assertion.
 */

import { z } from "zod";

import {
  buildOccurrenceAttendance,
  type OccurrenceAttendanceResult,
} from "@/lib/meetings/occurrenceAttendance";
import {
  buildSegmentAdherence,
  type SegmentAdherenceResult,
  type SegmentMarker,
} from "@/lib/meetings/segmentAdherence";
import { buildScorecard, hhmmToMinutes, type ScorecardResult } from "@/lib/meetings/scorecard";

import type { WmContext } from "./wmData";

/**
 * Bump when the stored shape changes.
 *
 * Part of the cache key, so a bump marks every existing report stale rather
 * than silently rendering an old shape through a new reader.
 */
export const WM_SCHEMA_VERSION = 1;

/** Below this, the report is PARTIAL and cannot be validated. */
export const WM_COMPLETE_COVERAGE_PCT = 100;

// ---------------------------------------------------------------------------
// Deterministic half
// ---------------------------------------------------------------------------

export interface DeterministicWm {
  attendance: OccurrenceAttendanceResult;
  segments: SegmentAdherenceResult;
  scorecard: ScorecardResult;
  /** Members who walked their dashboard, in roster order where resolvable. */
  kpiRows: WmKpiRow[];
  gaps: WmGapRow[];
  discussions: WmDiscussionRow[];
  coveragePct: number | null;
  completeness: "COMPLETE" | "PARTIAL";
  missingWindows: Array<{ startMs: number; endMs: number; label: string }>;
  /** Sections whose inputs fall in a window nobody read. */
  incompleteSections: string[];
}

export interface WmKpiRow {
  name: string;
  role: string | null;
  kpiRag: string;
  priorityRag: string;
  keyPoints: string[];
  /** True when two chunks reported different RAGs. Both are kept; neither wins. */
  ragConflict: boolean;
  /** True when the dashboard was marked not-applicable for this member. */
  notApplicable: boolean;
}

export interface WmGapRow {
  gap: string;
  agreedAction: string | null;
  owner: string | null;
  scope: "TEAM" | "INDIVIDUAL";
  raisedBy: string[];
  severityStated: string | null;
}

export interface WmDiscussionRow {
  kind: string;
  sharedBy: string | null;
  summary: string;
  outcome: string | null;
  wasDeferred: boolean;
}

/**
 * Compute every number in the report.
 *
 * Pure: takes a loaded context, returns tables. No database, no model, so the
 * arithmetic is testable against the reference report without either.
 */
export function computeDeterministicWm(context: WmContext): DeterministicWm {
  const held = context.meeting.callStatus === "HELD";

  const attendance = buildOccurrenceAttendance({
    roster: context.roster,
    occurrence: {
      held,
      markedAbsentIds: context.markedAbsentIds,
      absenceListAuthoritative: context.absenceListAuthoritative,
      participantIds: context.transcript?.attendeeMemberIds ?? [],
      spokeIds: context.facts.spokeMemberIds,
      participantListUsable: context.transcript?.participantListUsable ?? false,
    },
  });

  // Segment verdicts were computed at consolidation and stored. Recomputing
  // them here from markers would risk the two disagreeing; instead the stored
  // rows are replayed through the same builder so the shape is identical
  // whether or not extraction ran.
  const segments = buildSegmentAdherence({
    agenda: context.client.agenda,
    markers: markersFromFacts(context),
    meeting: context.meeting.flags,
    meetingEndMs: meetingEndMs(context),
    partialKeys: context.facts.segments
      .filter((s) => s.coverage === "PARTIAL")
      .map((s) => s.segmentKey),
  });

  const nameByMemberId = new Map(context.roster.map((m) => [m.id, m]));
  const dashboardNa = new Set(context.dashboardNaIds);

  const kpiRows: WmKpiRow[] = context.facts.kpi.map((k) => {
    const member = k.clientMemberId ? nameByMemberId.get(k.clientMemberId) : undefined;
    return {
      name: member?.name ?? k.speakerRaw,
      role: member?.role ?? null,
      // NOT_STATED is a real answer and is rendered as such. A blank cell would
      // read as "we forgot to look".
      kpiRag: k.kpiRag ?? "NOT_STATED",
      priorityRag: k.priorityRag ?? "NOT_STATED",
      keyPoints: k.keyPoints,
      ragConflict: k.ragConflict,
      notApplicable: k.clientMemberId ? dashboardNa.has(k.clientMemberId) : false,
    };
  });

  const gaps: WmGapRow[] = context.facts.gaps.map((g) => ({
    gap: g.gap,
    agreedAction: g.agreedAction,
    owner: g.ownerRaw,
    scope: g.scope === "TEAM" ? "TEAM" : "INDIVIDUAL",
    raisedBy: g.raisedByRaw,
    severityStated: g.severityStated,
  }));

  const discussions: WmDiscussionRow[] = context.facts.discussions.map((d) => ({
    kind: d.kind,
    sharedBy: d.sharedByRaw,
    summary: d.summary,
    outcome: d.outcome,
    wasDeferred: d.wasDeferred,
  }));

  const scorecard = buildScorecard({
    callHeld: held,
    plannedStartMinutes: hhmmToMinutes(context.client.weeklyStartTime),
    actualStartMinutes: hhmmToMinutes(context.meeting.actualStartTime),
    plannedEndMinutes: hhmmToMinutes(context.client.weeklyEndTime),
    actualEndMinutes: hhmmToMinutes(context.meeting.actualEndTime),
    punctualityOverride: context.meeting.punctualityOverride === "YES",
    attendancePct: attendance.attendancePct,
    segments,
    dashboardsReviewed: kpiRows.filter((r) => !r.notApplicable).length,
    dashboardsExpected: context.roster.filter(
      (m) => m.attendanceType === "REQUIRED" && !dashboardNa.has(m.id),
    ).length,
    gapCount: gaps.length,
  });

  const coveragePct = context.extraction?.coveragePct ?? null;
  const missingWindows = (context.extraction?.missingWindows ?? []).map((w) => ({
    ...w,
    label: `${hhmmss(w.startMs)}–${hhmmss(w.endMs)}`,
  }));

  const completeness: "COMPLETE" | "PARTIAL" =
    coveragePct !== null && coveragePct < WM_COMPLETE_COVERAGE_PCT ? "PARTIAL" : "COMPLETE";

  return {
    attendance,
    segments,
    scorecard,
    kpiRows,
    gaps,
    discussions,
    coveragePct,
    completeness,
    missingWindows,
    incompleteSections:
      completeness === "PARTIAL" ? sectionsTouching(missingWindows, segments) : [],
  };
}

/**
 * Replay stored segment verdicts as markers.
 *
 * The stored rows already carry the window consolidation computed. Feeding the
 * boundaries back through the builder keeps one implementation of coverage
 * reconciliation and time discipline, so the report and `MeetingSegmentFact`
 * cannot disagree about the same meeting.
 */
function markersFromFacts(context: WmContext): SegmentMarker[] {
  const markers: SegmentMarker[] = [];
  for (const s of context.facts.segments) {
    if (s.startMs === null) continue;
    markers.push({ segmentKey: s.segmentKey, boundary: "START", atMs: s.startMs });
    if (s.endMs !== null) {
      markers.push({ segmentKey: s.segmentKey, boundary: "END", atMs: s.endMs });
    }
  }
  return markers;
}

/** The last moment any segment was observed, so a trailing segment can be measured. */
function meetingEndMs(context: WmContext): number | null {
  const ends = context.facts.segments
    .map((s) => s.endMs)
    .filter((n): n is number => n !== null);
  return ends.length ? Math.max(...ends) : null;
}

/**
 * Which sections drew on a window nobody read.
 *
 * A segment whose window overlaps a missing chunk is marked, so the report says
 * "the gaps section is incomplete" rather than presenting three gaps as if they
 * were all of them.
 */
function sectionsTouching(
  missing: Array<{ startMs: number; endMs: number }>,
  segments: SegmentAdherenceResult,
): string[] {
  if (missing.length === 0) return [];
  const touched = new Set<string>();
  for (const row of segments.rows) {
    if (row.startMs === null) continue;
    const end = row.endMs ?? row.startMs;
    for (const w of missing) {
      if (w.startMs <= end && w.endMs >= row.startMs) {
        touched.add(row.key);
        break;
      }
    }
  }
  return [...touched];
}

function hhmmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// ---------------------------------------------------------------------------
// The AI half — prose only
// ---------------------------------------------------------------------------

/**
 * What the model contributes.
 *
 * Deliberately narrow. Everything here is a sentence about tables it was shown;
 * nothing here is a number, a name it invented, or a judgement about a person.
 */
export const wmAiSchema = z.object({
  overallConfidence: z.number().min(0).max(1),
  meetingSummary: z.string().min(1).max(1200),
  keyObservations: z.array(z.string().max(400)).min(1).max(6),
  agendaObservation: z.string().max(400).nullable(),
  gapObservation: z.string().max(400).nullable(),
  recommendations: z.array(z.string().max(400)).min(1).max(3),
});

export type WmAi = z.infer<typeof wmAiSchema>;

// ---------------------------------------------------------------------------
// The stored report
// ---------------------------------------------------------------------------

const attendanceRowSchema = z.object({
  memberId: z.string(),
  name: z.string(),
  role: z.string().nullable(),
  attendanceType: z.string(),
  state: z.string(),
  evidence: z.string(),
  scored: z.boolean(),
});

const segmentRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  order: z.number(),
  coverage: z.string(),
  coverageSource: z.string(),
  timeDiscipline: z.string(),
  expectedMinutes: z.number(),
  actualMinutes: z.number().nullable(),
  window: z.string().nullable(),
  humanFlag: z.string().nullable(),
  flagDisagrees: z.boolean(),
  comment: z.string().nullable(),
});

const scorecardMetricSchema = z.object({
  n: z.number(),
  label: z.string(),
  reading: z.string(),
  rag: z.string(),
  derivedProxy: z.boolean().optional(),
});

/**
 * Sections 5 and 6, supplied by the P7 services.
 *
 * Stored as opaque JSON here on purpose: those services own their shape and
 * their permission scoping, and duplicating their schema would create a second
 * definition to keep in step.
 */
const wwwSectionSchema = z.object({
  available: z.boolean(),
  /** Why the section is empty, when it is — never a silently empty table. */
  unavailableReason: z.string().nullable(),
  scopeLimited: z.boolean().default(false),
  rows: z.array(z.record(z.unknown())).default([]),
});

export const storedWmReportSchema = z.object({
  reportType: z.literal("WEEKLY_MEETING"),
  clientName: z.string(),
  meetingDate: z.string(),
  callHeld: z.boolean(),
  callStatus: z.string(),
  overallConfidence: z.number(),

  coverage: z.object({
    completeness: z.enum(["COMPLETE", "PARTIAL"]),
    coveragePct: z.number().nullable(),
    /** Present whenever extraction has not run at all. */
    extractionRan: z.boolean(),
    missingWindows: z.array(
      z.object({ startMs: z.number(), endMs: z.number(), label: z.string() }),
    ),
    incompleteSections: z.array(z.string()),
  }),

  // 1 — attendance
  attendance: z.object({
    rows: z.array(attendanceRowSchema),
    present: z.number(),
    absent: z.number(),
    onLeave: z.number(),
    unknown: z.number(),
    expected: z.number(),
    attendancePct: z.number().nullable(),
  }),

  // 2 — agenda coverage (§5.2)
  agenda: z.object({
    rows: z.array(segmentRowSchema),
    summary: z.record(z.union([z.number(), z.null()])),
    observation: z.string().nullable(),
  }),

  // 3 — K&P dashboard
  kpDashboard: z.object({
    rows: z.array(
      z.object({
        name: z.string(),
        role: z.string().nullable(),
        kpiRag: z.string(),
        priorityRag: z.string(),
        keyPoints: z.array(z.string()),
        ragConflict: z.boolean(),
        notApplicable: z.boolean(),
      }),
    ),
    reviewed: z.number(),
    expected: z.number(),
    ragCounts: z.record(z.number()),
  }),

  // 4 — gaps
  gaps: z.object({
    rows: z.array(
      z.object({
        gap: z.string(),
        agreedAction: z.string().nullable(),
        owner: z.string().nullable(),
        scope: z.string(),
        raisedBy: z.array(z.string()),
        severityStated: z.string().nullable(),
      }),
    ),
    teamWide: z.number(),
    withoutAction: z.number(),
    observation: z.string().nullable(),
  }),

  // 5 & 6 — WWW, from the P7 services
  wwwReview: wwwSectionSchema,
  newWww: wwwSectionSchema,

  // 7 — discussions
  discussions: z.object({
    goodNews: z.array(z.record(z.unknown())),
    customerFeedback: z.array(z.record(z.unknown())),
    employeeFeedback: z.array(z.record(z.unknown())),
    collectiveIntelligence: z.array(z.record(z.unknown())),
    /** Segments explicitly deferred — recorded, never backfilled. */
    deferred: z.array(z.string()),
  }),

  // 8 — scorecard + narrative
  scorecard: z.object({
    metrics: z.array(scorecardMetricSchema),
    overall: z.object({ reading: z.string(), rag: z.string() }),
    counts: z.record(z.number()),
  }),
  meetingSummary: z.string(),
  keyObservations: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export type StoredWmReport = z.infer<typeof storedWmReportSchema>;

/** One WWW section as the composer receives it. */
export interface WwwSectionInput {
  available: boolean;
  unavailableReason: string | null;
  scopeLimited?: boolean;
  rows: Array<Record<string, unknown>>;
}

/** Assemble the stored report from the deterministic tables plus the AI pass. */
export function composeWmReport(input: {
  context: WmContext;
  deterministic: DeterministicWm;
  ai: WmAi;
  wwwReview: WwwSectionInput;
  newWww: WwwSectionInput;
}): StoredWmReport {
  const { context, deterministic, ai } = input;

  const ragCounts: Record<string, number> = {};
  for (const row of deterministic.kpiRows) {
    ragCounts[row.kpiRag] = (ragCounts[row.kpiRag] ?? 0) + 1;
  }

  const byKind = (kind: string) =>
    deterministic.discussions
      .filter((d) => d.kind === kind && !d.wasDeferred)
      .map((d) => ({
        sharedBy: d.sharedBy,
        summary: d.summary,
        outcome: d.outcome,
      }));

  return {
    reportType: "WEEKLY_MEETING",
    clientName: context.client.name,
    meetingDate: context.meeting.meetingDate.toISOString().slice(0, 10),
    callHeld: context.meeting.callStatus === "HELD",
    callStatus: context.meeting.callStatusOther ?? context.meeting.callStatus,
    overallConfidence: ai.overallConfidence,

    coverage: {
      completeness: deterministic.completeness,
      coveragePct: deterministic.coveragePct,
      extractionRan: context.extraction !== null,
      missingWindows: deterministic.missingWindows,
      incompleteSections: deterministic.incompleteSections,
    },

    attendance: {
      rows: deterministic.attendance.rows,
      present: deterministic.attendance.present,
      absent: deterministic.attendance.absent,
      onLeave: deterministic.attendance.onLeave,
      unknown: deterministic.attendance.unknown,
      expected: deterministic.attendance.expected,
      attendancePct: deterministic.attendance.attendancePct,
    },

    agenda: {
      rows: deterministic.segments.rows.map((r) => ({
        key: r.key,
        label: r.label,
        order: r.order,
        coverage: r.coverage,
        coverageSource: r.coverageSource,
        timeDiscipline: r.timeDiscipline,
        expectedMinutes: r.expectedMinutes,
        actualMinutes: r.actualMinutes,
        window: r.window,
        humanFlag: r.humanFlag,
        flagDisagrees: r.flagDisagrees,
        comment: r.comment,
      })),
      summary: deterministic.segments.summary as unknown as Record<string, number | null>,
      observation: ai.agendaObservation,
    },

    kpDashboard: {
      rows: deterministic.kpiRows,
      reviewed: deterministic.kpiRows.filter((r) => !r.notApplicable).length,
      expected: context.roster.filter((m) => m.attendanceType === "REQUIRED").length,
      ragCounts,
    },

    gaps: {
      rows: deterministic.gaps,
      teamWide: deterministic.gaps.filter((g) => g.scope === "TEAM").length,
      // A gap with no agreed action is the most actionable line in the report,
      // so it is counted rather than left for a reader to notice.
      withoutAction: deterministic.gaps.filter((g) => !g.agreedAction).length,
      observation: ai.gapObservation,
    },

    wwwReview: {
      available: input.wwwReview.available,
      unavailableReason: input.wwwReview.unavailableReason,
      scopeLimited: input.wwwReview.scopeLimited ?? false,
      rows: input.wwwReview.rows,
    },
    newWww: {
      available: input.newWww.available,
      unavailableReason: input.newWww.unavailableReason,
      scopeLimited: input.newWww.scopeLimited ?? false,
      rows: input.newWww.rows,
    },

    discussions: {
      goodNews: byKind("GOOD_NEWS"),
      customerFeedback: byKind("CEF_CUSTOMER"),
      employeeFeedback: byKind("CEF_EMPLOYEE"),
      collectiveIntelligence: byKind("CI_TOPIC"),
      deferred: deterministic.discussions
        .filter((d) => d.wasDeferred)
        .map((d) => d.summary),
    },

    scorecard: {
      metrics: deterministic.scorecard.metrics,
      overall: deterministic.scorecard.overall,
      counts: deterministic.scorecard.counts as unknown as Record<string, number>,
    },
    meetingSummary: ai.meetingSummary,
    keyObservations: ai.keyObservations,
    recommendations: ai.recommendations,
  };
}

/**
 * Flat numeric snapshot for the monthly rollup.
 *
 * The same discipline that makes the monthly report cheap: it trends these rows
 * instead of re-reading a month of meetings.
 */
export function buildWmMetrics(
  deterministic: DeterministicWm,
): Record<string, number | null> {
  const s = deterministic.segments.summary;
  return {
    attendancePct: deterministic.attendance.attendancePct,
    membersPresent: deterministic.attendance.present,
    membersAbsent: deterministic.attendance.absent,
    membersExpected: deterministic.attendance.expected,
    segmentsDone: s.done,
    segmentsPartial: s.partial,
    segmentsNotDone: s.notDone,
    segmentsOverRan: s.overRan,
    segmentsRushed: s.rushed,
    segmentDisagreements: s.disagreements,
    expectedMinutesTotal: s.expectedMinutesTotal,
    actualMinutesTotal: s.actualMinutesTotal,
    dashboardsReviewed: deterministic.kpiRows.filter((r) => !r.notApplicable).length,
    kpiRed: deterministic.kpiRows.filter((r) => r.kpiRag === "RED").length,
    kpiAmber: deterministic.kpiRows.filter((r) => r.kpiRag === "AMBER").length,
    kpiGreen: deterministic.kpiRows.filter((r) => r.kpiRag === "GREEN").length,
    ragConflicts: deterministic.kpiRows.filter((r) => r.ragConflict).length,
    gapsTotal: deterministic.gaps.length,
    gapsTeamWide: deterministic.gaps.filter((g) => g.scope === "TEAM").length,
    gapsWithoutAction: deterministic.gaps.filter((g) => !g.agreedAction).length,
    scorecardGreen: deterministic.scorecard.counts.green,
    scorecardAmber: deterministic.scorecard.counts.amber,
    scorecardRed: deterministic.scorecard.counts.red,
    coveragePct: deterministic.coveragePct,
  };
}
