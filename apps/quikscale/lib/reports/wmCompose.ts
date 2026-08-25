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
import {
  budgetFor,
  describeOmissions,
  mergeOmissions,
  reduceFacts,
  type Omission,
} from "@/lib/facts/reduce";

import { buildFactSet, type MeetingFactSet } from "./factSet";

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
  /**
   * Facts the report does not show, by type and workstream.
   *
   * Empty for almost every meeting. Non-empty means a section was bounded, and
   * that has to be stated — a reduction nobody can see is just truncation with
   * extra steps, which is the bug this replaced.
   */
  omitted: Omission[];
  /** The meeting's workstreams, where any were identified. */
  topics: string[];
  /**
   * Counts over the FULL fact set, before reduction.
   *
   * Every metric is derived from here rather than from the rendered rows. A
   * number that moved with how much the report had room to print would be
   * worthless — and these feed the monthly rollup, so the error would compound
   * silently across a quarter.
   */
  totals: {
    kpiReads: number;
    kpiRed: number;
    kpiAmber: number;
    kpiGreen: number;
    ragConflicts: number;
    dashboardsReviewed: number;
    gaps: number;
    gapsTeamWide: number;
    gapsWithoutAction: number;
    discussions: number;
  };
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
  /** Workstream, where one was identified. Null groups reduce together. */
  topicKey: string | null;
}

export interface WmDiscussionRow {
  kind: string;
  sharedBy: string | null;
  summary: string;
  outcome: string | null;
  wasDeferred: boolean;
  /** Workstream, where one was identified. Null groups reduce together. */
  topicKey: string | null;
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

  // ── Bounded reduction (doc 17 §R1) ──────────────────────────────────────
  // A six-hour meeting across four workstreams can consolidate to hundreds of
  // facts. What the report SHOWS is bounded; what it COUNTS is not. Every
  // metric below is computed from the full fact arrays, and only the rendered
  // tables are reduced — so a bounded gaps table never changes the gap count,
  // the scorecard, or anything the monthly rollup trends.
  const reducedKpi = reduceFacts(
    context.facts.kpi.map((k) => ({
      ...k,
      factType: "KPI",
      subject: k.clientMemberId ?? k.speakerRaw,
    })),
    budgetFor("KPI"),
  );
  const reducedGaps = reduceFacts(
    context.facts.gaps.map((g) => ({ ...g, factType: "GAP", subject: null })),
    budgetFor("GAP"),
  );
  const reducedDiscussions = reduceFacts(
    // Kind is the subject, so a good-news item and a CI topic are never reduced
    // against each other and every kind reaches the report.
    context.facts.discussions.map((d) => ({
      ...d,
      factType: "DISCUSSION",
      subject: d.kind,
    })),
    budgetFor("DISCUSSION"),
  );

  const omitted = mergeOmissions(
    reducedKpi.omitted,
    reducedGaps.omitted,
    reducedDiscussions.omitted,
  );
  const topics = [
    ...new Set(
      [...context.facts.gaps, ...context.facts.discussions, ...context.facts.kpi]
        .map((f) => f.topicKey)
        .filter((t): t is string => Boolean(t)),
    ),
  ].sort();

  const kpiRows: WmKpiRow[] = reducedKpi.kept.map((k) => {
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

  const gaps: WmGapRow[] = reducedGaps.kept.map((g) => ({
    gap: g.gap,
    agreedAction: g.agreedAction,
    owner: g.ownerRaw,
    scope: g.scope === "TEAM" ? "TEAM" : "INDIVIDUAL",
    raisedBy: g.raisedByRaw,
    severityStated: g.severityStated,
    topicKey: g.topicKey,
  }));

  const discussions: WmDiscussionRow[] = reducedDiscussions.kept.map((d) => ({
    kind: d.kind,
    sharedBy: d.sharedByRaw,
    summary: d.summary,
    outcome: d.outcome,
    wasDeferred: d.wasDeferred,
    topicKey: d.topicKey,
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
    // Counted from the FULL fact set, never from the reduced view. A bounded
    // table must never move a metric — that would make the scorecard depend on
    // how much of the meeting the report had room to print.
    dashboardsReviewed: context.facts.kpi.filter(
      (k) => !(k.clientMemberId && dashboardNa.has(k.clientMemberId)),
    ).length,
    dashboardsExpected: context.roster.filter(
      (m) => m.attendanceType === "REQUIRED" && !dashboardNa.has(m.id),
    ).length,
    gapCount: context.facts.gaps.length,
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
    omitted,
    topics,
    // Counted from `context.facts`, never from the reduced rows above.
    totals: {
      kpiReads: context.facts.kpi.length,
      kpiRed: context.facts.kpi.filter((k) => k.kpiRag === "RED").length,
      kpiAmber: context.facts.kpi.filter((k) => k.kpiRag === "AMBER").length,
      kpiGreen: context.facts.kpi.filter((k) => k.kpiRag === "GREEN").length,
      ragConflicts: context.facts.kpi.filter((k) => k.ragConflict).length,
      dashboardsReviewed: context.facts.kpi.filter(
        (k) => !(k.clientMemberId && dashboardNa.has(k.clientMemberId)),
      ).length,
      gaps: context.facts.gaps.length,
      gapsTeamWide: context.facts.gaps.filter((g) => g.scope === "TEAM").length,
      gapsWithoutAction: context.facts.gaps.filter((g) => !g.agreedAction).length,
      discussions: context.facts.discussions.length,
    },
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

  /**
   * Facts recorded but not shown, because a section was bounded (doc 17 §R1).
   *
   * Distinct from `coverage` and deliberately separate: coverage is about what
   * nobody READ, this is about what the report had no room to PRINT. Conflating
   * them would tell a facilitator a recording gap exists when there is none.
   */
  reduction: z.object({
    complete: z.boolean(),
    topics: z.array(z.string()),
    omitted: z.array(
      z.object({
        factType: z.string(),
        topicKey: z.string().nullable(),
        dropped: z.number(),
        total: z.number(),
        reason: z.string(),
      }),
    ),
    notes: z.array(z.string()),
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
        /** Workstream, so a long meeting's gaps can be read by area. */
        topicKey: z.string().nullable().default(null),
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

    reduction: {
      complete: deterministic.omitted.length === 0,
      topics: deterministic.topics,
      omitted: deterministic.omitted,
      // Phrased for a reader, not a log line: the facts still exist and are
      // reachable through the evidence drawer. What is bounded is this
      // report's view of them, not the record.
      notes: describeOmissions(deterministic.omitted),
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
      // Counts describe the meeting; rows describe what fitted in the table.
      reviewed: deterministic.totals.dashboardsReviewed,
      expected: context.roster.filter((m) => m.attendanceType === "REQUIRED").length,
      ragCounts,
    },

    gaps: {
      rows: deterministic.gaps,
      teamWide: deterministic.totals.gapsTeamWide,
      // A gap with no agreed action is the most actionable line in the report,
      // so it is counted rather than left for a reader to notice.
      withoutAction: deterministic.totals.gapsWithoutAction,
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
 * The bounded qualitative digest a rollup reads (doc 17 §R2).
 *
 * Built from `context.facts` — the FULL set — not from the reduced display
 * rows. A monthly report must not inherit a decision about what fitted on this
 * week's page; those are different questions with different budgets.
 */
export function buildWmFactSet(
  context: WmContext,
  deterministic: DeterministicWm,
): MeetingFactSet {
  const day = context.meeting.meetingDate.toISOString().slice(0, 10);
  const nameByMemberId = new Map(context.roster.map((m) => [m.id, m]));

  return buildFactSet({
    kind: "WM",
    periodStart: day,
    periodEnd: day,
    topics: deterministic.topics,
    // Gaps are this meeting's blockers as far as recurrence is concerned: the
    // weekly meeting surfaces them where the daily huddle surfaces stucks, and
    // a rollup wants one recurrence signal, not two that never meet.
    stucks: context.facts.gaps.map((g) => ({
      normalizedKey: g.normalizedKey,
      description: g.gap,
      raisedBy: g.raisedByRaw[0] ?? null,
      date: day,
      statusStated: g.severityStated,
      topicKey: g.topicKey,
    })),
    gaps: context.facts.gaps.map((g) => ({
      normalizedKey: g.normalizedKey,
      gap: g.gap,
      scope: g.scope,
      raisedBy: g.raisedByRaw,
      hasAgreedAction: Boolean(g.agreedAction),
      topicKey: g.topicKey,
    })),
    discussions: context.facts.discussions.map((d) => ({
      kind: d.kind,
      normalizedKey: d.normalizedKey,
      summary: d.summary,
      wasDeferred: d.wasDeferred,
      topicKey: d.topicKey,
    })),
    kpi: context.facts.kpi.map((k) => {
      const member = k.clientMemberId ? nameByMemberId.get(k.clientMemberId) : undefined;
      return {
        key: k.clientMemberId ?? k.speakerRaw,
        name: member?.name ?? k.speakerRaw,
        kpiRag: k.kpiRag ?? "NOT_STATED",
        priorityRag: k.priorityRag ?? "NOT_STATED",
        ragConflict: k.ragConflict,
      };
    }),
    // The report's own omissions travel with the digest, so a rollup built on
    // it can say the picture was bounded rather than repeating the silence.
    omitted: deterministic.omitted,
  });
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
    // From `totals`, never from the rendered rows. These are the numbers the
    // monthly rollup trends, so counting the reduced view here would compound a
    // presentation decision into a quarter of business metrics.
    dashboardsReviewed: deterministic.totals.dashboardsReviewed,
    kpiRed: deterministic.totals.kpiRed,
    kpiAmber: deterministic.totals.kpiAmber,
    kpiGreen: deterministic.totals.kpiGreen,
    ragConflicts: deterministic.totals.ragConflicts,
    gapsTotal: deterministic.totals.gaps,
    gapsTeamWide: deterministic.totals.gapsTeamWide,
    gapsWithoutAction: deterministic.totals.gapsWithoutAction,
    scorecardGreen: deterministic.scorecard.counts.green,
    scorecardAmber: deterministic.scorecard.counts.amber,
    scorecardRed: deterministic.scorecard.counts.red,
    coveragePct: deterministic.coveragePct,
  };
}
