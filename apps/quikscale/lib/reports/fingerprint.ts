/**
 * Source-data fingerprints — the thing that decides whether a report is fresh.
 *
 * WHAT PROBLEM THIS SOLVES
 * ------------------------
 * Today every press of Generate re-runs the whole pipeline and re-bills, whether
 * or not anything changed, and a weekly regenerate additionally re-pays for up
 * to seven daily extractions. There is no stored answer to "was this report
 * built from the data that is in the database right now?".
 *
 * A fingerprint is that answer: a hash over every input a report was built
 * from. Combined with `promptVersion` and `schemaVersion` it forms the cache
 * key (see `cacheDecision.ts`). Equal ⇒ serve the stored report for zero
 * tokens. Different ⇒ the report is stale and the user is offered Regenerate.
 *
 * TWO PROPERTIES THAT MATTER, AND ARE TESTED
 * ------------------------------------------
 *   1. STABLE — the same inputs must hash the same, regardless of the order
 *      rows came back from Postgres. Every collection is sorted by an explicit
 *      key before hashing. Without this, an unordered `findMany` would make
 *      every report perpetually stale and the cache worthless.
 *   2. COMPLETE — anything that can change a rendered number must be in the
 *      hash. A missing input means a silently stale report, which is worse than
 *      a needlessly regenerated one: the user would be shown numbers that no
 *      longer match the data and given no signal.
 *
 * The inverse failure — too MUCH in the hash — shows up as a high
 * regeneration rate in `reports/metrics`, and costs UI noise rather than
 * correctness, because staleness never auto-regenerates.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` §L.
 */

import { createHash } from "node:crypto";

import { stableStringify } from "@/lib/audit/diff";

/**
 * Bump when the *composition* of a fingerprint changes — a new input is added,
 * or an existing one is computed differently.
 *
 * It is part of the hash, so bumping it marks every report stale. Do that
 * deliberately: it is the correct response to "we were not hashing X, so
 * reports could be silently wrong", and the wrong response to a refactor that
 * does not change which inputs matter.
 */
export const FINGERPRINT_VERSION = 1;

/** sha256, hex, truncated to 32 chars — 128 bits, ample against collision. */
function hash(payload: unknown): string {
  return createHash("sha256")
    .update(stableStringify(payload))
    .digest("hex")
    .slice(0, 32);
}

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

/**
 * One source transcript's contribution.
 *
 * `extractionFingerprint` is deliberately absent: what matters to a *report* is
 * which version of which transcript was extracted by which extractor, not the
 * internals of how the extractor got there.
 */
export interface TranscriptInput {
  transcriptId: string;
  /** Increments when `rawText` changes. */
  transcriptVersion: number;
  /** Null before the transcript has been extracted at all. */
  extractionVersion: number | null;
  /** Share of the meeting actually extracted; a failed chunk later retried
   *  raises this, which correctly marks the report stale so it can improve. */
  coveragePct: number | null;
}

/** Roster snapshot. Attendance denominators depend on every field here. */
export interface RosterInput {
  clientMemberId: string;
  /** REQUIRED | OPTIONAL | EXTERNAL — only REQUIRED is scored. */
  attendanceType: string;
  /** Aliases change speaker→member resolution, so they change attendance. */
  aliases: string[];
}

/** Meeting configuration. Drives planned days, punctuality and duration. */
export interface MeetingConfigInput {
  /** e.g. ["Mon","Tue","Wed","Thu"] for daily huddles. */
  plannedDays?: string[];
  plannedStartTime?: string | null;
  plannedEndTime?: string | null;
  /** Per-occurrence overrides: { "2026-08-12": "10:30" }. */
  plannedStartOverrides?: Record<string, string | null>;
  /** Weekly Meeting agenda: segment keys and their expected minutes. */
  agendaConfig?: unknown;
}

/**
 * Human input that outranks the AI. Changing any of it must invalidate the
 * report, because the report is required to defer to it.
 */
export interface HumanEditInput {
  /** memberId → ISO dates marked absent, with the reason. */
  absences?: Record<string, { date: string; reason: string | null }[]>;
  /** memberId → ISO dates of approved/planned leave. */
  leave?: Record<string, string[]>;
  /** The 7 `ClientMeetingFlag` segment columns on a Weekly Meeting. */
  segmentFlags?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Canonicalisation
// ---------------------------------------------------------------------------

const sortedTranscripts = (rows: TranscriptInput[]) =>
  [...rows]
    .sort((a, b) => a.transcriptId.localeCompare(b.transcriptId))
    .map((t) => [
      t.transcriptId,
      t.transcriptVersion,
      t.extractionVersion ?? 0,
      // Rounded: float noise in a coverage percentage must not churn the hash,
      // but a real coverage change (a retried chunk) must be visible.
      t.coveragePct === null ? -1 : Math.round(t.coveragePct * 100) / 100,
    ]);

const sortedRoster = (rows: RosterInput[]) =>
  [...rows]
    .sort((a, b) => a.clientMemberId.localeCompare(b.clientMemberId))
    .map((m) => [m.clientMemberId, m.attendanceType, [...m.aliases].sort()]);

/** Sort a record's keys, and any string-array values, for order independence. */
function sortedRecord(rec: Record<string, unknown> | undefined): unknown {
  if (!rec) return null;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(rec).sort()) {
    const v = rec[key];
    out[key] = Array.isArray(v) ? [...v].map(String).sort() : (v ?? null);
  }
  return out;
}

function canonicalHumanEdits(h: HumanEditInput | undefined): unknown {
  if (!h) return null;
  const absences: Record<string, string[]> = {};
  for (const [memberId, rows] of Object.entries(h.absences ?? {})) {
    absences[memberId] = [...rows]
      .map((r) => `${r.date}:${r.reason ?? ""}`)
      .sort();
  }
  return {
    absences: sortedRecord(absences),
    leave: sortedRecord(h.leave),
    segmentFlags: sortedRecord(h.segmentFlags),
  };
}

// ---------------------------------------------------------------------------
// Per-report-kind fingerprints
// ---------------------------------------------------------------------------

export interface DhWeeklyFingerprintInput {
  orgId: string;
  clientId: string;
  /** ISO date (UTC Monday). */
  weekStart: string;
  transcripts: TranscriptInput[];
  roster: RosterInput[];
  config: MeetingConfigInput;
  humanEdits?: HumanEditInput;
}

/** Daily Huddle Weekly Report — one week of huddles for one client. */
export function dhWeeklyFingerprint(input: DhWeeklyFingerprintInput): string {
  return hash({
    v: FINGERPRINT_VERSION,
    kind: "DH_WEEKLY",
    orgId: input.orgId,
    clientId: input.clientId,
    weekStart: input.weekStart,
    transcripts: sortedTranscripts(input.transcripts),
    roster: sortedRoster(input.roster),
    config: {
      plannedDays: [...(input.config.plannedDays ?? [])].sort(),
      plannedStartTime: input.config.plannedStartTime ?? null,
      plannedEndTime: input.config.plannedEndTime ?? null,
      plannedStartOverrides: sortedRecord(input.config.plannedStartOverrides),
    },
    humanEdits: canonicalHumanEdits(input.humanEdits),
  });
}

export interface WeeklyMeetingFingerprintInput {
  orgId: string;
  clientId: string;
  weeklyMeetingId: string;
  transcripts: TranscriptInput[];
  roster: RosterInput[];
  config: MeetingConfigInput;
  humanEdits?: HumanEditInput;
  /**
   * State of the WWW items the WWW Review section reads.
   *
   * The Weekly Meeting report is the one report whose freshness depends on data
   * outside the meeting: if an owner moves an item to `completed` after the
   * report was generated, the WWW Review section is now wrong. The DH weekly
   * report has no WWW Review, so it is deliberately unaffected.
   */
  wwwState?: { wwwItemId: string; status: string; when: string; revisions: number }[];
}

/** Weekly Meeting Report — one meeting. */
export function weeklyMeetingFingerprint(
  input: WeeklyMeetingFingerprintInput,
): string {
  return hash({
    v: FINGERPRINT_VERSION,
    kind: "WM",
    orgId: input.orgId,
    clientId: input.clientId,
    weeklyMeetingId: input.weeklyMeetingId,
    transcripts: sortedTranscripts(input.transcripts),
    roster: sortedRoster(input.roster),
    config: {
      plannedStartTime: input.config.plannedStartTime ?? null,
      plannedEndTime: input.config.plannedEndTime ?? null,
      plannedStartOverrides: sortedRecord(input.config.plannedStartOverrides),
      agendaConfig: input.config.agendaConfig ?? null,
    },
    humanEdits: canonicalHumanEdits(input.humanEdits),
    wwwState: [...(input.wwwState ?? [])]
      .sort((a, b) => a.wwwItemId.localeCompare(b.wwwItemId))
      .map((w) => [w.wwwItemId, w.status, w.when, w.revisions]),
  });
}

export interface MonthlyFingerprintInput {
  orgId: string;
  clientId: string;
  /** "2026-08" */
  period: string;
  /**
   * The weekly and Weekly-Meeting reports being trended.
   *
   * Monthly hashes its *sources' versions*, not their source data. That is the
   * whole point of the layering: a monthly report is fresh exactly when the
   * reports beneath it have not been regenerated, and it never needs to know
   * what a transcript said.
   */
  sourceReports: { reportId: string; kind: string; version: number }[];
  wwwState?: { wwwItemId: string; status: string; when: string; revisions: number }[];
}

/** Monthly Report — built from stored weekly artefacts, never from transcripts. */
export function monthlyFingerprint(input: MonthlyFingerprintInput): string {
  return hash({
    v: FINGERPRINT_VERSION,
    kind: "MONTHLY",
    orgId: input.orgId,
    clientId: input.clientId,
    period: input.period,
    sourceReports: [...input.sourceReports]
      .sort((a, b) =>
        a.kind === b.kind
          ? a.reportId.localeCompare(b.reportId)
          : a.kind.localeCompare(b.kind),
      )
      .map((r) => [r.kind, r.reportId, r.version]),
    wwwState: [...(input.wwwState ?? [])]
      .sort((a, b) => a.wwwItemId.localeCompare(b.wwwItemId))
      .map((w) => [w.wwwItemId, w.status, w.when, w.revisions]),
  });
}

/**
 * Week Rollup — the same shape as the monthly one, and for the same reason.
 *
 * Both are built from stored artefacts rather than from source data, so both
 * hash their SOURCES' versions. A rollup is fresh exactly when the reports
 * beneath it have not been regenerated, and it never needs to know what a
 * transcript said. Only the kind and the period label differ.
 */
export function weekRollupFingerprint(input: {
  orgId: string;
  clientId: string;
  /** ISO Monday, e.g. "2026-08-03". */
  weekStart: string;
  sourceReports: { reportId: string; kind: string; version: number }[];
  wwwState?: { wwwItemId: string; status: string; when: string; revisions: number }[];
}): string {
  return hash({
    v: FINGERPRINT_VERSION,
    kind: "WEEK_ROLLUP",
    orgId: input.orgId,
    clientId: input.clientId,
    period: input.weekStart,
    sourceReports: [...input.sourceReports]
      .sort((a, b) =>
        a.kind === b.kind
          ? a.reportId.localeCompare(b.reportId)
          : a.kind.localeCompare(b.kind),
      )
      .map((r) => [r.kind, r.reportId, r.version]),
    wwwState: [...(input.wwwState ?? [])]
      .sort((a, b) => a.wwwItemId.localeCompare(b.wwwItemId))
      .map((w) => [w.wwwItemId, w.status, w.when, w.revisions]),
  });
}

/**
 * Idempotency key for one extraction run (doc 17 §D.8).
 *
 * Distinct from a report fingerprint: this identifies "extracting THIS
 * transcript with THIS toolchain", and is what the
 * `MeetingExtractionRun @@unique([orgId, idempotencyKey])` constraint enforces
 * so a duplicate request joins the existing run instead of starting a second
 * pipeline. Every version that can change the extracted facts is included —
 * omitting one would let a normaliser or chunker change go unnoticed and leave
 * facts inconsistent with the code that reads them.
 */
export function extractionIdempotencyKey(input: {
  orgId: string;
  clientId: string | null;
  transcriptId: string;
  meetingId: string | null;
  transcriptVersion: number;
  normalizationVersion: number;
  chunkerVersion: number;
  extractionVersion: number;
  extractPromptVersion: string;
}): string {
  return hash({
    v: FINGERPRINT_VERSION,
    kind: "EXTRACTION",
    orgId: input.orgId,
    clientId: input.clientId ?? null,
    transcriptId: input.transcriptId,
    meetingId: input.meetingId ?? null,
    transcriptVersion: input.transcriptVersion,
    normalizationVersion: input.normalizationVersion,
    chunkerVersion: input.chunkerVersion,
    extractionVersion: input.extractionVersion,
    extractPromptVersion: input.extractPromptVersion,
  });
}

/**
 * sha256 of a transcript's raw text — the `ClientMeetingTranscript.sourceHash`
 * that gates `transcriptVersion`.
 *
 * Hashed verbatim, with no normalisation: the question is "did the source
 * change at all", and normalising first would hide a real edit whose effect on
 * extraction we cannot predict.
 */
export function transcriptSourceHash(rawText: string): string {
  return createHash("sha256").update(rawText, "utf8").digest("hex");
}
