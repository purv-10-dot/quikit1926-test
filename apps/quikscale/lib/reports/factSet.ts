/**
 * The Meeting Fact Set — a bounded, persisted digest of one report's facts.
 *
 * WHAT PROBLEM THIS SOLVES
 * ------------------------
 * `metrics` already gives higher levels a bounded numeric snapshot, and it is
 * why the monthly report trends four weeks for ~5k tokens instead of 1.4M. But
 * numbers alone cannot answer "which blocker recurred all month" or "who keeps
 * reporting No Stuck", so the monthly path went back to the raw fact tables and
 * pulled a month of rows into memory.
 *
 * That works today and does not scale: it is the same unbounded-collection
 * pattern chunked extraction exists to avoid, one level up. A quarterly or
 * annual view over the same code would read a year of facts.
 *
 * So every report also persists a bounded QUALITATIVE digest. A week rollup, a
 * month, a quarter and a year all consume the same compact shape, and the cost
 * of a rollup grows with the number of REPORTS, not with the number of facts.
 *
 * WHAT IT IS NOT
 * --------------
 * Not a replacement for the fact layer. Raw facts stay exactly where they are —
 * they are the audit trail, the evidence drawer's source, and the thing a
 * facilitator drills into. The fact set is a derived view, recomputable at any
 * time by regenerating the report it belongs to.
 */

import { z } from "zod";

import type { Omission } from "@/lib/facts/reduce";

/**
 * Bump when the shape changes.
 *
 * A rollup reading an older fact set must be able to tell, because silently
 * treating a v1 set as v2 would produce a confident answer from the wrong
 * fields. Readers check this and fall back rather than guess.
 */
export const FACT_SET_VERSION = 1;

/**
 * How much of each list a fact set may hold.
 *
 * Larger than the report's display budgets on purpose: this is a machine-read
 * digest, not a page, and a rollup benefits from the long tail a printed table
 * cannot show. Still bounded, because "bounded" is the entire point.
 */
export const FACT_SET_LIMITS = {
  stucks: 60,
  gaps: 60,
  discussions: 40,
  members: 60,
  kpi: 60,
} as const;

const memberDigestSchema = z.object({
  /** Roster member id where resolved, else the speaker label. */
  key: z.string(),
  name: z.string(),
  /** Occurrences attended in this period, so rates can be weighted. */
  attended: z.number(),
  achievementPct: z.number().nullable(),
  focusPct: z.number().nullable(),
  stuckPct: z.number().nullable(),
  /** Times this member explicitly said they had no blocker. */
  noStuckCount: z.number(),
});

const stuckDigestSchema = z.object({
  /** The recurrence key. Stable across meetings, which is what makes rollup work. */
  normalizedKey: z.string(),
  description: z.string(),
  occurrences: z.number(),
  raisedBy: z.array(z.string()),
  /** ISO dates this blocker appeared on, for counting distinct weeks. */
  dates: z.array(z.string()),
  latestStatusStated: z.string().nullable(),
  topicKey: z.string().nullable(),
});

const gapDigestSchema = z.object({
  normalizedKey: z.string(),
  gap: z.string(),
  scope: z.string(),
  raisedBy: z.array(z.string()),
  /** Whether anything was agreed — the most actionable bit, kept as a boolean. */
  hasAgreedAction: z.boolean(),
  topicKey: z.string().nullable(),
});

const discussionDigestSchema = z.object({
  kind: z.string(),
  normalizedKey: z.string(),
  summary: z.string(),
  wasDeferred: z.boolean(),
  topicKey: z.string().nullable(),
});

const kpiDigestSchema = z.object({
  key: z.string(),
  name: z.string(),
  kpiRag: z.string(),
  priorityRag: z.string(),
  ragConflict: z.boolean(),
});

export const factSetSchema = z.object({
  version: z.number(),
  /** DH_WEEKLY | WM — which report produced this. */
  kind: z.string(),
  /** ISO dates covered, so a rollup can place it in a period. */
  periodStart: z.string(),
  periodEnd: z.string(),
  topics: z.array(z.string()).default([]),
  members: z.array(memberDigestSchema).default([]),
  stucks: z.array(stuckDigestSchema).default([]),
  gaps: z.array(gapDigestSchema).default([]),
  discussions: z.array(discussionDigestSchema).default([]),
  kpi: z.array(kpiDigestSchema).default([]),
  /**
   * What the digest itself left out, carried forward from the report.
   *
   * A rollup built on a bounded set must be able to say so, or the same silent
   * truncation reappears one level up — which is the whole failure this design
   * removed at meeting level.
   */
  omitted: z
    .array(
      z.object({
        factType: z.string(),
        topicKey: z.string().nullable(),
        dropped: z.number(),
        total: z.number(),
        reason: z.string(),
      }),
    )
    .default([]),
  /** True when the digest holds everything the report had. */
  complete: z.boolean().default(true),
});

export type MeetingFactSet = z.infer<typeof factSetSchema>;
export type StuckDigest = z.infer<typeof stuckDigestSchema>;
export type MemberDigest = z.infer<typeof memberDigestSchema>;

/**
 * Cap a list and record what that cost.
 *
 * Every trim in this file goes through here. A digest that quietly dropped its
 * tail would push the truncation problem up a level instead of solving it.
 */
function capped<T>(
  items: T[],
  limit: number,
  factType: string,
  into: Omission[],
): T[] {
  if (items.length <= limit) return items;
  into.push({
    factType,
    topicKey: null,
    dropped: items.length - limit,
    total: items.length,
    reason: `The stored digest holds the ${limit} most significant ${factType.toLowerCase()} items; the rest remain queryable as facts.`,
  });
  return items.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/** One occurrence's worth of blocker input, as either report can supply it. */
export interface StuckInput {
  normalizedKey: string;
  description: string;
  raisedBy: string | null;
  date: string;
  statusStated: string | null;
  topicKey?: string | null;
}

/**
 * Group blockers by their recurrence key.
 *
 * The key is computed once during extraction and never recomputed here — two
 * modules normalising the same text differently would silently split a
 * recurring blocker into two, which is exactly the recurrence signal a rollup
 * exists to find.
 */
export function digestStucks(inputs: StuckInput[]): StuckDigest[] {
  const byKey = new Map<string, StuckDigest>();

  for (const s of inputs) {
    const existing = byKey.get(s.normalizedKey);
    if (!existing) {
      byKey.set(s.normalizedKey, {
        normalizedKey: s.normalizedKey,
        description: s.description,
        occurrences: 1,
        raisedBy: s.raisedBy ? [s.raisedBy] : [],
        dates: [s.date],
        latestStatusStated: s.statusStated,
        topicKey: s.topicKey ?? null,
      });
      continue;
    }
    existing.occurrences += 1;
    if (s.raisedBy && !existing.raisedBy.includes(s.raisedBy)) {
      existing.raisedBy.push(s.raisedBy);
    }
    if (!existing.dates.includes(s.date)) existing.dates.push(s.date);
    // Latest stated status wins — an older "OPEN" must not outrank a later
    // "RESOLVED", and a later silence must not erase a stated status.
    if (s.statusStated) existing.latestStatusStated = s.statusStated;
  }

  return [...byKey.values()].sort(
    (a, b) => b.occurrences - a.occurrences || a.normalizedKey.localeCompare(b.normalizedKey),
  );
}

export interface BuildFactSetInput {
  kind: "DH_WEEKLY" | "WM";
  periodStart: string;
  periodEnd: string;
  topics?: string[];
  members?: MemberDigest[];
  stucks?: StuckInput[];
  gaps?: z.infer<typeof gapDigestSchema>[];
  discussions?: z.infer<typeof discussionDigestSchema>[];
  kpi?: z.infer<typeof kpiDigestSchema>[];
  /** Omissions the REPORT already recorded, carried through unchanged. */
  omitted?: Omission[];
}

/** Assemble a bounded fact set for one report. */
export function buildFactSet(input: BuildFactSetInput): MeetingFactSet {
  // The report's own omissions come first, then anything the digest itself
  // trims, so a reader sees both in one list.
  const omitted: Omission[] = [...(input.omitted ?? [])];

  const set: MeetingFactSet = {
    version: FACT_SET_VERSION,
    kind: input.kind,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    topics: input.topics ?? [],
    members: capped(input.members ?? [], FACT_SET_LIMITS.members, "MEMBER", omitted),
    stucks: capped(
      digestStucks(input.stucks ?? []),
      FACT_SET_LIMITS.stucks,
      "STUCK",
      omitted,
    ),
    gaps: capped(input.gaps ?? [], FACT_SET_LIMITS.gaps, "GAP", omitted),
    discussions: capped(
      input.discussions ?? [],
      FACT_SET_LIMITS.discussions,
      "DISCUSSION",
      omitted,
    ),
    kpi: capped(input.kpi ?? [], FACT_SET_LIMITS.kpi, "KPI", omitted),
    omitted,
    complete: omitted.length === 0,
  };

  return set;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Parse a stored fact set, or null.
 *
 * Null for a report generated before this column existed, and null for a
 * version this code does not understand. Both are legitimate and both are
 * handled the same way by callers: fall back to the fact tables and say the
 * period was read the slow way, rather than reporting an empty month.
 */
export function readFactSet(stored: unknown): MeetingFactSet | null {
  if (!stored || typeof stored !== "object") return null;

  const parsed = factSetSchema.safeParse(stored);
  if (!parsed.success) return null;
  if (parsed.data.version !== FACT_SET_VERSION) return null;

  return parsed.data;
}

export interface AggregatedFactSets {
  /** Blockers merged across every set, by recurrence key. */
  stucks: Array<StuckDigest & { periodsSeen: number }>;
  members: MemberDigest[];
  topics: string[];
  gaps: MeetingFactSet["gaps"];
  discussions: MeetingFactSet["discussions"];
  omitted: Omission[];
  /** True when every source set held everything it had. */
  complete: boolean;
}

/**
 * Merge several reports' fact sets into one period view.
 *
 * This is the operation the whole design is for: a month is four of these, a
 * quarter is thirteen, and the cost is the same shape either way because each
 * set is already bounded.
 *
 * `periodsSeen` is deliberately separate from `occurrences`: a blocker raised
 * three times in one week is a bad week, and raised once in each of four weeks
 * is a pattern. Collapsing them into one number would lose the distinction the
 * requirement doc asks for by name.
 */
export function aggregateFactSets(sets: MeetingFactSet[]): AggregatedFactSets {
  const stucks = new Map<string, StuckDigest & { periodsSeen: number }>();
  const members = new Map<string, MemberDigest>();
  const topics = new Set<string>();
  const omitted: Omission[] = [];

  for (const set of sets) {
    for (const t of set.topics) topics.add(t);
    omitted.push(...set.omitted);

    for (const s of set.stucks) {
      const existing = stucks.get(s.normalizedKey);
      if (!existing) {
        stucks.set(s.normalizedKey, { ...s, periodsSeen: 1 });
        continue;
      }
      existing.occurrences += s.occurrences;
      existing.periodsSeen += 1;
      for (const who of s.raisedBy) {
        if (!existing.raisedBy.includes(who)) existing.raisedBy.push(who);
      }
      for (const d of s.dates) {
        if (!existing.dates.includes(d)) existing.dates.push(d);
      }
      if (s.latestStatusStated) existing.latestStatusStated = s.latestStatusStated;
    }

    for (const m of set.members) {
      const existing = members.get(m.key);
      if (!existing) {
        members.set(m.key, { ...m });
        continue;
      }
      // Percentages are re-averaged weighted by attendance, because a member
      // present once must not swing a month as hard as one present twenty
      // times. An unweighted mean of weekly percentages does exactly that.
      const total = existing.attended + m.attended;
      const blend = (a: number | null, b: number | null): number | null => {
        if (a === null) return b;
        if (b === null) return a;
        if (total === 0) return a;
        return Math.round(((a * existing.attended + b * m.attended) / total) * 10) / 10;
      };
      existing.achievementPct = blend(existing.achievementPct, m.achievementPct);
      existing.focusPct = blend(existing.focusPct, m.focusPct);
      existing.stuckPct = blend(existing.stuckPct, m.stuckPct);
      existing.noStuckCount += m.noStuckCount;
      existing.attended = total;
    }
  }

  return {
    stucks: [...stucks.values()].sort(
      (a, b) =>
        b.periodsSeen - a.periodsSeen ||
        b.occurrences - a.occurrences ||
        a.normalizedKey.localeCompare(b.normalizedKey),
    ),
    members: [...members.values()].sort((a, b) => a.name.localeCompare(b.name)),
    topics: [...topics].sort(),
    gaps: sets.flatMap((s) => s.gaps),
    discussions: sets.flatMap((s) => s.discussions),
    omitted,
    complete: sets.every((s) => s.complete),
  };
}
