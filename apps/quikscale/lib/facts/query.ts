/**
 * Reading the fact layer.
 *
 * This is the module every report generator consumes. Transcripts are read once
 * by the extractor and never again (doc 17 §G lever 2) — the DH Weekly Report,
 * the Weekly Meeting Report and the Monthly Report all read from here instead.
 *
 * TWO PROPERTIES ARE STRUCTURAL, NOT CONVENTIONAL
 * -----------------------------------------------
 * 1. PERIOD SCOPE IS ENFORCED IN SQL. `getPeriodFacts` bounds `meetingDate` in
 *    the `where` clause, so a generator physically cannot see a fact outside
 *    its reporting window. The client doc forbids the DH Weekly Report from
 *    comparing against previous weeks; that rule is kept by making the data
 *    unreachable rather than by asking a prompt not to look at it.
 *
 * 2. EVERY NUMBER IS COMPUTED HERE, IN TYPESCRIPT. Adherence percentages,
 *    recurrence counts and No-Stuck rates are derived from stored
 *    classifications using the fixed Yes=100 / Partial=50 / No=0 mapping. No
 *    model is involved in any function in this file.
 *
 * AVERAGED OVER HUDDLES ATTENDED, NOT HUDDLES HELD
 * ------------------------------------------------
 * The requirement doc is explicit: evaluate a member only for the huddles they
 * actually attended. Because there is exactly one `MeetingParticipantFact` per
 * (member, meeting), the denominator is simply the number of facts that exist
 * for that member — an absent member has no row and is therefore not penalised.
 * Getting this wrong would silently punish anyone on leave.
 */

import { db } from "@/lib/db";

import { scoreAdherence, type Adherence } from "./schemas";

/** Evidence as stored on a fact row. */
export interface StoredEvidence {
  quote: string;
  transcriptSegmentIds: number[];
}

export interface ParticipantFactRow {
  id: string;
  transcriptId: string;
  meetingDate: Date | null;
  speakerRaw: string;
  clientMemberId: string | null;
  achievement: { text: string | null; adherence: string; quality: string; evidence: StoredEvidence[] };
  focus: { text: string | null; adherence: string; quality: string; evidence: StoredEvidence[] };
  stuck: { text: string | null; adherence: string; quality: string; evidence: StoredEvidence[] };
  noStuck: boolean;
  confidence: number;
}

export interface StuckFactRow {
  id: string;
  transcriptId: string;
  meetingDate: Date | null;
  raisedByRaw: string;
  raisedByMemberId: string | null;
  raisedForRaw: string | null;
  description: string;
  normalizedKey: string;
  category: string | null;
  statusStated: string | null;
  evidence: StoredEvidence[];
  confidence: number;
}

export interface WwwFactRow {
  id: string;
  transcriptId: string;
  meetingDate: Date | null;
  whoRaw: string | null;
  whoMemberId: string | null;
  whoUserId: string | null;
  what: string;
  whenText: string | null;
  whenMissing: boolean;
  completeness: string;
  evidence: StoredEvidence[];
  confidence: number;
  linkedWwwItemId: string | null;
  dismissedAt: Date | null;
}

export interface FactBundle {
  participants: ParticipantFactRow[];
  stucks: StuckFactRow[];
  www: WwwFactRow[];
}

const asEvidence = (v: unknown): StoredEvidence[] =>
  Array.isArray(v) ? (v as StoredEvidence[]) : [];

/**
 * Facts are excluded when soft-deleted or folded into another fact by
 * consolidation. Both are expressed here once so no caller can forget the
 * `mergedIntoId` half and silently double-count a merged duplicate.
 */
const LIVE = { deletedAt: null, mergedIntoId: null } as const;

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

/** Every live fact for one transcript. */
export async function getTranscriptFacts(
  orgId: string,
  transcriptId: string,
): Promise<FactBundle> {
  const [participants, stucks, www] = await Promise.all([
    db.meetingParticipantFact.findMany({
      where: { orgId, transcriptId, ...LIVE },
      orderBy: { speakerRaw: "asc" },
    }),
    db.meetingStuckFact.findMany({
      where: { orgId, transcriptId, ...LIVE },
      orderBy: { createdAt: "asc" },
    }),
    db.meetingWwwFact.findMany({
      where: { orgId, transcriptId, ...LIVE },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    participants: participants.map(mapParticipant),
    stucks: stucks.map(mapStuck),
    www: www.map(mapWww),
  };
}

/**
 * Facts for one client across a date range.
 *
 * The generator for a given reporting period calls this and gets exactly that
 * period. There is no option to widen it, because the ability to widen it is
 * precisely what the no-cross-week rule forbids.
 */
export async function getPeriodFacts(
  orgId: string,
  clientId: string,
  from: Date,
  to: Date,
  options: { cadence?: "DAILY" | "WEEKLY" } = {},
): Promise<FactBundle> {
  const window = {
    orgId,
    clientId,
    meetingDate: { gte: from, lte: to },
    ...(options.cadence ? { cadence: options.cadence } : {}),
    ...LIVE,
  };

  const [participants, stucks, www] = await Promise.all([
    db.meetingParticipantFact.findMany({
      where: window,
      orderBy: [{ meetingDate: "asc" }, { speakerRaw: "asc" }],
    }),
    db.meetingStuckFact.findMany({
      where: window,
      orderBy: [{ meetingDate: "asc" }, { createdAt: "asc" }],
    }),
    db.meetingWwwFact.findMany({
      where: window,
      orderBy: [{ meetingDate: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  return {
    participants: participants.map(mapParticipant),
    stucks: stucks.map(mapStuck),
    www: www.map(mapWww),
  };
}

// ---------------------------------------------------------------------------
// Deterministic derivations — no model, ever
// ---------------------------------------------------------------------------

export interface MemberAdherence {
  clientMemberId: string | null;
  speakerRaw: string;
  /** Huddles this member actually attended — the denominator. */
  huddlesAttended: number;
  achievementPct: number;
  focusPct: number;
  stuckPct: number;
  /** Mean of the three dimensions. */
  averagePct: number;
  /** Distribution of quality classifications, for the observations section. */
  achievementQuality: Record<string, number>;
  focusQuality: Record<string, number>;
  stuckQuality: Record<string, number>;
  noStuckCount: number;
  noStuckRate: number;
}

const isAdherence = (v: string): v is Adherence =>
  v === "YES" || v === "PARTIAL" || v === "NO";

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

/**
 * Per-member adherence, computed from stored classifications.
 *
 * Members are keyed on `clientMemberId` where it resolved, and otherwise on the
 * raw speaker label — an unresolved speaker still gets a row rather than being
 * silently dropped, so the unmatched-participants problem stays visible instead
 * of quietly shrinking the roster.
 */
export function computeMemberAdherence(
  participants: ParticipantFactRow[],
): MemberAdherence[] {
  const groups = new Map<string, ParticipantFactRow[]>();
  for (const p of participants) {
    const key = p.clientMemberId ?? `raw:${p.speakerRaw.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  return [...groups.values()].map((rows) => {
    const score = (pick: (r: ParticipantFactRow) => string): number =>
      mean(
        rows
          .map(pick)
          .filter(isAdherence)
          .map(scoreAdherence),
      );

    const achievementPct = score((r) => r.achievement.adherence);
    const focusPct = score((r) => r.focus.adherence);
    const stuckPct = score((r) => r.stuck.adherence);
    const noStuckCount = rows.filter((r) => r.noStuck).length;

    return {
      clientMemberId: rows[0].clientMemberId,
      speakerRaw: rows[0].speakerRaw,
      // The denominator: huddles ATTENDED, not huddles held. An absent member
      // has no fact row and so is never penalised for a day they were not there.
      huddlesAttended: rows.length,
      achievementPct,
      focusPct,
      stuckPct,
      averagePct: Math.round(((achievementPct + focusPct + stuckPct) / 3) * 10) / 10,
      achievementQuality: tally(rows.map((r) => r.achievement.quality)),
      focusQuality: tally(rows.map((r) => r.focus.quality)),
      stuckQuality: tally(rows.map((r) => r.stuck.quality)),
      noStuckCount,
      noStuckRate: rows.length ? Math.round((noStuckCount / rows.length) * 1000) / 10 : 0,
    };
  });
}

export interface TeamAdherence {
  achievementPct: number;
  focusPct: number;
  stuckPct: number;
  membersScored: number;
}

/**
 * Team adherence — the mean of the MEMBERS' averages, not of all facts.
 *
 * This matters and is easy to get wrong: averaging every fact equally would
 * weight a member who attended five huddles five times as heavily as one who
 * attended one, turning the team figure into an attendance-weighted number
 * rather than a team-behaviour one. `weeklyHuddleAggregate.ts` already computes
 * it this way; this matches so the two cannot disagree.
 */
export function computeTeamAdherence(members: MemberAdherence[]): TeamAdherence {
  return {
    achievementPct: mean(members.map((m) => m.achievementPct)),
    focusPct: mean(members.map((m) => m.focusPct)),
    stuckPct: mean(members.map((m) => m.stuckPct)),
    membersScored: members.length,
  };
}

export interface RecurringStuck {
  normalizedKey: string;
  /** The longest description seen — most informative for the report. */
  description: string;
  occurrences: number;
  raisedBy: string[];
  raisedFor: string[];
  dates: string[];
  factIds: string[];
  /** The most recent stated status, or null if never stated aloud. */
  latestStatusStated: string | null;
}

/**
 * Group stucks by `normalizedKey` to find repeats.
 *
 * Free: no model, no vector index. The same grouping works within a week
 * (§4.5B) and across a month, which is why the key is stored on the row rather
 * than computed at read time.
 */
export function findRecurringStucks(
  stucks: StuckFactRow[],
  options: { minOccurrences?: number } = {},
): RecurringStuck[] {
  const min = options.minOccurrences ?? 2;
  const groups = new Map<string, StuckFactRow[]>();
  for (const s of stucks) {
    if (!s.normalizedKey) continue;
    groups.set(s.normalizedKey, [...(groups.get(s.normalizedKey) ?? []), s]);
  }

  return [...groups.entries()]
    .filter(([, rows]) => rows.length >= min)
    .map(([normalizedKey, rows]) => {
      const ordered = [...rows].sort(
        (a, b) => (a.meetingDate?.getTime() ?? 0) - (b.meetingDate?.getTime() ?? 0),
      );
      const stated = [...ordered].reverse().find((r) => r.statusStated);
      return {
        normalizedKey,
        description: ordered.reduce(
          (longest, r) => (r.description.length > longest.length ? r.description : longest),
          "",
        ),
        occurrences: ordered.length,
        raisedBy: [...new Set(ordered.map((r) => r.raisedByRaw))],
        raisedFor: [...new Set(ordered.map((r) => r.raisedForRaw).filter((v): v is string => !!v))],
        dates: [
          ...new Set(
            ordered
              .map((r) => r.meetingDate?.toISOString().slice(0, 10))
              .filter((v): v is string => !!v),
          ),
        ],
        factIds: ordered.map((r) => r.id),
        latestStatusStated: stated?.statusStated ?? null,
      };
    })
    .sort((a, b) => b.occurrences - a.occurrences);
}

export interface FactCoverage {
  transcriptIds: string[];
  meetingDates: string[];
  participantFacts: number;
  stuckFacts: number;
  wwwFacts: number;
  /** Members with at least one fact in the period. */
  membersSeen: number;
  /** Speakers that never resolved to a roster member — the resolve-tray input. */
  unresolvedSpeakers: string[];
}

/**
 * What the fact layer actually holds for a period.
 *
 * A report generator checks this before it starts: generating a weekly report
 * from three days of facts when five huddles were held would produce numbers
 * that look authoritative and are not.
 */
export function summariseCoverage(bundle: FactBundle): FactCoverage {
  const transcriptIds = [
    ...new Set([
      ...bundle.participants.map((p) => p.transcriptId),
      ...bundle.stucks.map((s) => s.transcriptId),
      ...bundle.www.map((w) => w.transcriptId),
    ]),
  ];

  const dates = [
    ...new Set(
      bundle.participants
        .map((p) => p.meetingDate?.toISOString().slice(0, 10))
        .filter((v): v is string => !!v),
    ),
  ].sort();

  return {
    transcriptIds,
    meetingDates: dates,
    participantFacts: bundle.participants.length,
    stuckFacts: bundle.stucks.length,
    wwwFacts: bundle.www.length,
    membersSeen: new Set(
      bundle.participants.map((p) => p.clientMemberId).filter((v): v is string => !!v),
    ).size,
    unresolvedSpeakers: [
      ...new Set(
        bundle.participants.filter((p) => !p.clientMemberId).map((p) => p.speakerRaw),
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

type ParticipantRecord = Awaited<
  ReturnType<typeof db.meetingParticipantFact.findMany>
>[number];
type StuckRecord = Awaited<ReturnType<typeof db.meetingStuckFact.findMany>>[number];
type WwwRecord = Awaited<ReturnType<typeof db.meetingWwwFact.findMany>>[number];

function mapParticipant(r: ParticipantRecord): ParticipantFactRow {
  return {
    id: r.id,
    transcriptId: r.transcriptId,
    meetingDate: r.meetingDate,
    speakerRaw: r.speakerRaw,
    clientMemberId: r.clientMemberId,
    achievement: {
      text: r.achievementText,
      adherence: r.achievementAdherence,
      quality: r.achievementQuality,
      evidence: asEvidence(r.achievementEvidence),
    },
    focus: {
      text: r.focusText,
      adherence: r.focusAdherence,
      quality: r.focusQuality,
      evidence: asEvidence(r.focusEvidence),
    },
    stuck: {
      text: r.stuckText,
      adherence: r.stuckAdherence,
      quality: r.stuckQuality,
      evidence: asEvidence(r.stuckEvidence),
    },
    noStuck: r.noStuck,
    confidence: r.confidence,
  };
}

function mapStuck(r: StuckRecord): StuckFactRow {
  return {
    id: r.id,
    transcriptId: r.transcriptId,
    meetingDate: r.meetingDate,
    raisedByRaw: r.raisedByRaw,
    raisedByMemberId: r.raisedByMemberId,
    raisedForRaw: r.raisedForRaw,
    description: r.description,
    normalizedKey: r.normalizedKey,
    category: r.category,
    statusStated: r.statusStated,
    evidence: asEvidence(r.evidence),
    confidence: r.confidence,
  };
}

function mapWww(r: WwwRecord): WwwFactRow {
  return {
    id: r.id,
    transcriptId: r.transcriptId,
    meetingDate: r.meetingDate,
    whoRaw: r.whoRaw,
    whoMemberId: r.whoMemberId,
    whoUserId: r.whoUserId,
    what: r.what,
    whenText: r.whenText,
    whenMissing: r.whenMissing,
    completeness: r.completeness,
    evidence: asEvidence(r.evidence),
    confidence: r.confidence,
    linkedWwwItemId: r.linkedWwwItemId,
    dismissedAt: r.dismissedAt,
  };
}
