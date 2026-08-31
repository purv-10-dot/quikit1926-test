/**
 * Cache state for the Daily Huddle Weekly Report.
 *
 * P0 built the fingerprint and cache-decision utilities; this is what wires
 * them to the live route. Until now every press of Generate re-ran the whole
 * pipeline and re-billed whether or not anything had changed — and a weekly
 * regenerate additionally re-paid for up to seven daily extractions.
 *
 * THE CACHE KEY IS A TRIPLE
 * -------------------------
 *   sourceFingerprint  did the underlying data change?
 *   promptVersion      did we change how we ask the model?
 *   schemaVersion      did we change the shape we store?
 *
 * All three match ⇒ the stored report is current. Any differ ⇒ it is STALE, and
 * the user is offered Regenerate. **Staleness never auto-regenerates**: doing so
 * would re-bill on a page view and silently void a facilitator's sign-off.
 *
 * WHAT GOES INTO THE FINGERPRINT, AND WHY EACH
 * --------------------------------------------
 * Anything that can change a rendered number has to be in the hash, or a report
 * goes silently stale — showing figures that no longer match the data, with no
 * signal. The inverse error (too much in the hash) shows up as a high
 * regeneration rate in `reports/metrics` and costs UI noise, not correctness.
 *
 *   transcripts   content and extraction version per day
 *   roster        membership, attendance type, aliases — all change attendance
 *   config        planned days and times, per-day start overrides
 *   leave         approved leave, which removes days from a member's denominator
 *   humanEdits    absence marks — human input outranks the AI everywhere
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` §L.
 */

import { db } from "@/lib/db";
import { PROMPT_VERSION as DH_WEEKLY_PROMPT_VERSION } from "@/lib/ai/weeklyHuddleReport";
import {
  dhWeeklyFingerprint,
  type RosterInput,
  type TranscriptInput,
} from "@/lib/reports/fingerprint";
import {
  decideCache,
  type CacheVerdict,
  type StoredReportState,
} from "@/lib/reports/cacheDecision";
import type { WeekContext } from "@/lib/services/weeklyHuddleData";

/**
 * Version of the stored report JSON shape.
 *
 * Bump when `storedWeeklyReportSchema` changes in a way older readers cannot
 * handle. Bumping marks every report stale, so it is the right response to a
 * real shape change and the wrong response to adding an optional field.
 */
export const DH_WEEKLY_SCHEMA_VERSION = 1;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Gather the transcript inputs for the week.
 *
 * `coveragePct` is deliberately included: a chunk that failed and was later
 * retried successfully raises coverage, which SHOULD mark the report stale —
 * that is the good case, where regenerating makes the report strictly better.
 */
async function transcriptInputs(
  orgId: string,
  context: WeekContext,
): Promise<TranscriptInput[]> {
  const ids = context.days
    .map((d) => d.transcriptId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  const rows = await db.clientMeetingTranscript.findMany({
    where: { orgId, id: { in: ids }, deletedAt: null },
    select: { id: true, transcriptVersion: true, extractionVersion: true },
  });

  // Latest run per transcript, for coverage. A transcript never extracted has
  // no run and contributes null, which is a stable value — not a moving one.
  const runs = await db.meetingExtractionRun.findMany({
    where: { orgId, transcriptId: { in: ids } },
    orderBy: { createdAt: "desc" },
    select: { transcriptId: true, coveragePct: true },
  });
  const coverageByTranscript = new Map<string, number | null>();
  for (const r of runs) {
    if (!coverageByTranscript.has(r.transcriptId)) {
      coverageByTranscript.set(r.transcriptId, r.coveragePct);
    }
  }

  return rows.map((r) => ({
    transcriptId: r.id,
    transcriptVersion: r.transcriptVersion,
    extractionVersion: r.extractionVersion,
    coveragePct: coverageByTranscript.get(r.id) ?? null,
  }));
}

async function rosterInputs(orgId: string, context: WeekContext): Promise<RosterInput[]> {
  const memberIds = context.roster.map((m) => m.id);
  if (memberIds.length === 0) return [];

  // Aliases change speaker→member resolution, and therefore attendance. A new
  // alias can move a member from UNKNOWN to PRESENT, so it belongs in the hash.
  const aliases = await db.clientMemberAlias.findMany({
    where: { orgId, clientMemberId: { in: memberIds } },
    select: { clientMemberId: true, alias: true },
  });
  const byMember = new Map<string, string[]>();
  for (const a of aliases) {
    byMember.set(a.clientMemberId, [...(byMember.get(a.clientMemberId) ?? []), a.alias]);
  }

  return context.roster.map((m) => ({
    clientMemberId: m.id,
    attendanceType: m.attendanceType ?? "REQUIRED",
    aliases: byMember.get(m.id) ?? [],
  }));
}

/**
 * Human absence marks and approved leave for the week.
 *
 * Both outrank the AI's reading of the transcript, so a change to either must
 * invalidate the report. Leave especially: it removes days from a member's
 * denominator, and a stale report would keep penalising someone for days they
 * were never expected.
 */
async function humanEditInputs(
  orgId: string,
  context: WeekContext,
): Promise<{
  absences: Record<string, { date: string; reason: string | null }[]>;
  leave: Record<string, string[]>;
}> {
  const huddleIds = context.days.map((d) => d.id);
  const absences: Record<string, { date: string; reason: string | null }[]> = {};
  const leave: Record<string, string[]> = {};

  if (huddleIds.length === 0) return { absences, leave };

  const rows = await db.clientDailyHuddleTeamAbsence.findMany({
    where: { huddleId: { in: huddleIds } },
    select: { huddleId: true, clientMemberId: true, absenceReason: true },
  });

  const dateByHuddle = new Map(context.days.map((d) => [d.id, ymd(d.meetingDate)]));

  for (const r of rows) {
    const date = dateByHuddle.get(r.huddleId);
    if (!date) continue;
    const reason = r.absenceReason ?? null;

    absences[r.clientMemberId] = [
      ...(absences[r.clientMemberId] ?? []),
      { date, reason },
    ];

    if (reason === "PLANNED_LEAVE") {
      leave[r.clientMemberId] = [...(leave[r.clientMemberId] ?? []), date];
    }
  }

  return { absences, leave };
}

export interface WeeklyCacheState {
  sourceFingerprint: string;
  promptVersion: string;
  schemaVersion: number;
  /** Mean coverage across the week's extracted transcripts, or null. */
  coveragePct: number | null;
}

/** Compute what the pipeline WOULD produce for this week right now. */
export async function computeWeeklyCacheState(
  orgId: string,
  clientId: string,
  context: WeekContext,
): Promise<WeeklyCacheState> {
  const [transcripts, roster, human] = await Promise.all([
    transcriptInputs(orgId, context),
    rosterInputs(orgId, context),
    humanEditInputs(orgId, context),
  ]);

  // Per-day planned-start overrides. Null everywhere is the normal case and
  // hashes stably; a facilitator moving one day's slot changes exactly one key.
  const plannedStartOverrides: Record<string, string | null> = {};
  for (const d of context.days) {
    plannedStartOverrides[ymd(d.meetingDate)] = d.plannedStartOverride ?? null;
  }

  const covered = transcripts
    .map((t) => t.coveragePct)
    .filter((c): c is number => c !== null);

  return {
    sourceFingerprint: dhWeeklyFingerprint({
      orgId,
      clientId,
      weekStart: ymd(context.weekStart),
      transcripts,
      roster,
      config: {
        plannedDays: context.client.dailyDays,
        plannedStartTime: context.client.dailyStartTime,
        plannedEndTime: context.client.dailyEndTime,
        plannedStartOverrides,
      },
      humanEdits: { absences: human.absences, leave: human.leave },
    }),
    promptVersion: DH_WEEKLY_PROMPT_VERSION,
    schemaVersion: DH_WEEKLY_SCHEMA_VERSION,
    coveragePct:
      covered.length > 0
        ? Math.round((covered.reduce((a, b) => a + b, 0) / covered.length) * 10) / 10
        : null,
  };
}

/** The stored row, reduced to what the decision needs. */
export interface StoredWeeklyRow {
  sourceFingerprint: string | null;
  promptVersion: string | null;
  schemaVersion: number | null;
  coveragePct: number | null;
  currentVersion: number | null;
  validatedAt: Date | null;
}

/**
 * Decide whether a stored report is current.
 *
 * Pure delegation to `decideCache`, kept here so callers get the report-kind's
 * state and its verdict from one place and cannot accidentally compare a
 * report against a cache state computed for a different week.
 */
export function evaluateWeeklyCache(
  stored: StoredWeeklyRow | null,
  current: WeeklyCacheState,
): CacheVerdict {
  const state: StoredReportState | null = stored
    ? {
        sourceFingerprint: stored.sourceFingerprint,
        promptVersion: stored.promptVersion,
        schemaVersion: stored.schemaVersion,
        coveragePct: stored.coveragePct,
        currentVersion: stored.currentVersion,
        validatedAt: stored.validatedAt,
      }
    : null;

  return decideCache(state, {
    sourceFingerprint: current.sourceFingerprint,
    promptVersion: current.promptVersion,
    schemaVersion: current.schemaVersion,
    coveragePct: current.coveragePct,
  });
}
