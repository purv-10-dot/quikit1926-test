/**
 * Weekly-Meeting consolidation — the fan-in half of P5.
 *
 * The daily-huddle fact types (participants, stucks, WWW) consolidate in
 * `runExtraction.ts`. The four Weekly-Meeting types need rules of their own,
 * because two of them are not "merge duplicates" problems at all:
 *
 *   segment markers  A START seen in chunk 3 and the END seen in chunk 5 are
 *                    ONE segment window. This is global reconstruction, not
 *                    deduplication, and it is the only reason §5.2's
 *                    Expected-vs-Actual table is computable.
 *   K&P reads        One row per member. Two chunks reading the same member's
 *                    dashboard union their key points; a RAG that DISAGREES
 *                    between them is recorded as a conflict and never resolved
 *                    by us — a stated RAG is a fact about the meeting, and
 *                    picking a winner would be an opinion about the business.
 *   gaps             Ordinary dedupe, then TEAM promotion: a shortfall named by
 *                    three or more people is one gap with three raisers, which
 *                    is what the requirement doc asks for and the opposite of
 *                    what per-member rows would show.
 *   discussions      Ordinary dedupe, keyed on kind + summary.
 *
 * Every merge is audited and reversible, and `UNSURE ⇒ DO NOT MERGE` holds here
 * exactly as it does for stucks.
 */

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { resolveAgenda } from "@/lib/meetings/agendaConfig";
import {
  buildSegmentAdherence,
  type SegmentMarker,
} from "@/lib/meetings/segmentAdherence";

import {
  MERGE_RULES,
  consolidateDeterministic,
  unionEvidence,
  type MergeDecision,
  type MergeableFact,
} from "./consolidate";

/** A gap raised by this many distinct people is a team-wide gap. */
export const TEAM_GAP_THRESHOLD = 3;

type Tx = Prisma.TransactionClient;

/** Writes the merge audit rows. Supplied by the caller so one implementation serves every fact type. */
type AuditWriter = (
  tx: Tx,
  factType: string,
  merges: MergeDecision[],
) => Promise<void>;

/** Identity of the run being consolidated. */
interface RunRef {
  id: string;
  clientId: string | null;
  transcriptId: string;
}

/** The raw marker shape parked on `MeetingChunk.segmentMarkers`. */
interface StoredMarker {
  segmentKey: string;
  boundary: "START" | "END";
  atSegmentId: number;
  partial: boolean;
  confidence: number;
}

export interface WeeklyConsolidationResult {
  merges: number;
  segmentsBuilt: number;
  ragConflicts: number;
  teamGaps: number;
}

/**
 * Consolidate every Weekly-Meeting fact type for one run.
 *
 * Safe to call for a DAILY run: each step no-ops when its fact type is absent,
 * which keeps the caller free of cadence branching.
 */
export async function consolidateWeekly(
  orgId: string,
  run: RunRef,
  writeAudit: AuditWriter,
): Promise<WeeklyConsolidationResult> {
  const kpi = await consolidateKpiReads(orgId, run, writeAudit);
  const gaps = await consolidateGaps(orgId, run, writeAudit);
  const discussions = await consolidateDiscussions(orgId, run, writeAudit);
  const segmentsBuilt = await buildSegmentFacts(orgId, run);

  return {
    merges: kpi.merges + gaps.merges + discussions,
    segmentsBuilt,
    ragConflicts: kpi.conflicts,
    teamGaps: gaps.teamGaps,
  };
}

// ---------------------------------------------------------------------------
// K&P reads
// ---------------------------------------------------------------------------

/**
 * One row per member, key points unioned, RAG conflicts recorded not resolved.
 *
 * Keyed on the speaker rather than on wording: a member's dashboard read is one
 * fact about that member no matter how many chunks it spans, and two members
 * saying near-identical things are still two reads.
 */
async function consolidateKpiReads(
  orgId: string,
  run: RunRef,
  writeAudit: AuditWriter,
): Promise<{ merges: number; conflicts: number }> {
  const rows = await db.meetingKpiFact.findMany({
    where: { orgId, runId: run.id, deletedAt: null, mergedIntoId: null },
    orderBy: [{ chunkIdx: "asc" }, { createdAt: "asc" }],
  });
  if (rows.length < 2) return { merges: 0, conflicts: 0 };

  const bySpeaker = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.speakerRaw.trim().toLowerCase();
    const list = bySpeaker.get(key);
    if (list) list.push(r);
    else bySpeaker.set(key, [r]);
  }

  const merges: MergeDecision[] = [];
  let conflicts = 0;

  await db.$transaction(async (tx) => {
    for (const group of bySpeaker.values()) {
      if (group.length < 2) continue;

      // The chunk that OWNS the read survives; an overlap-only sighting is the
      // previous chunk's copy and must never outrank it.
      const survivor = group.find((r) => !r.fromOverlap) ?? group[0];
      const merged = group.filter((r) => r.id !== survivor.id);

      const isStated = (v: string | null): v is string =>
        v !== null && v !== "NOT_STATED";
      const disagrees = (field: "kpiRag" | "priorityRag") =>
        new Set(group.map((r) => r[field]).filter(isStated)).size > 1;

      const ragConflict = disagrees("kpiRag") || disagrees("priorityRag");
      if (ragConflict) conflicts += 1;

      // A stated value beats silence — NOT_STATED in one chunk and RED in
      // another is not a conflict, it is one chunk having seen the read.
      const firstStated = (field: "kpiRag" | "priorityRag") =>
        isStated(survivor[field])
          ? survivor[field]
          : (group.map((r) => r[field]).find(isStated) ?? survivor[field]);

      await tx.meetingKpiFact.update({
        where: { id: survivor.id },
        data: {
          kpiRag: firstStated("kpiRag"),
          priorityRag: firstStated("priorityRag"),
          keyPoints: [...new Set(group.flatMap((r) => r.keyPoints))].slice(0, 24),
          ragConflict,
          evidence: unionEvidence(
            survivor.evidence as unknown as { quote: string }[],
            merged.map((r) => r.evidence as unknown as { quote: string }[]),
          ) as unknown as Prisma.InputJsonValue,
        },
      });

      for (const m of merged) {
        await tx.meetingKpiFact.update({
          where: { id: m.id },
          data: { mergedIntoId: survivor.id, deletedAt: new Date() },
        });
        merges.push({
          survivorId: survivor.id,
          mergedId: m.id,
          rule: MERGE_RULES.EXACT_KEY,
          similarity: 1,
          decidedBy: "deterministic",
          confidence: 1,
        });
      }
    }

    await writeAudit(tx, "KPI", merges);
  });

  return { merges: merges.length, conflicts };
}

// ---------------------------------------------------------------------------
// Gaps
// ---------------------------------------------------------------------------

/**
 * Dedupe gaps, then promote the widely-felt ones to TEAM scope.
 *
 * The promotion is what turns "six coaches each raised hiring" into one gap the
 * report can act on. It runs AFTER merging so the raiser count is the number of
 * distinct people, not the number of chunks that happened to hear it.
 */
async function consolidateGaps(
  orgId: string,
  run: RunRef,
  writeAudit: AuditWriter,
): Promise<{ merges: number; teamGaps: number }> {
  const rows = await db.meetingGapFact.findMany({
    where: { orgId, runId: run.id, deletedAt: null, mergedIntoId: null },
    orderBy: [{ chunkIdx: "asc" }, { createdAt: "asc" }],
  });
  if (rows.length === 0) return { merges: 0, teamGaps: 0 };

  const mergeable: MergeableFact[] = rows.map((r) => ({
    id: r.id,
    normalizedKey: r.normalizedKey,
    description: r.gap,
    // Deliberately null: unlike a stuck, the same gap raised by two people IS
    // one gap — that is the whole point of TEAM consolidation. Keying on the
    // raiser here would defeat it.
    subject: null,
    chunkIdx: r.chunkIdx,
    fromOverlap: r.fromOverlap,
    confidence: r.confidence,
  }));

  const result = consolidateDeterministic(mergeable);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const mergedAway = new Set(result.merges.map((m) => m.mergedId));

  // Every row that was not merged away is a survivor and still needs its TEAM
  // verdict — a gap can reach the threshold from raisers inside a single chunk.
  const survivors = new Map<string, string[]>();
  for (const r of rows) {
    if (mergedAway.has(r.id)) continue;
    survivors.set(r.id, result.mergedInto.get(r.id) ?? []);
  }

  let teamGaps = 0;

  await db.$transaction(async (tx) => {
    for (const [survivorId, mergedIds] of survivors) {
      const survivor = byId.get(survivorId);
      if (!survivor) continue;
      const merged = mergedIds
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => Boolean(r));

      const raisers = [
        ...new Set(
          [survivor, ...merged]
            .flatMap((r) => r.raisedByRaw)
            .map((n) => n.trim())
            .filter(Boolean)
            .map((n) => n),
        ),
      ];

      // The model may already have called it TEAM from within one chunk; that
      // judgement stands. This only ADDS the cross-chunk case it could not see.
      const scope =
        survivor.scope === "TEAM" || raisers.length >= TEAM_GAP_THRESHOLD
          ? "TEAM"
          : survivor.scope;
      if (scope === "TEAM") teamGaps += 1;

      // An agreed action stated anywhere wins over silence — the same recovery
      // rule the WWW `when` uses.
      const withAction = [survivor, ...merged].find((r) => r.agreedAction);

      await tx.meetingGapFact.update({
        where: { id: survivorId },
        data: {
          scope,
          raisedByRaw: raisers.slice(0, 40),
          agreedAction: survivor.agreedAction ?? withAction?.agreedAction ?? null,
          ownerRaw: survivor.ownerRaw ?? withAction?.ownerRaw ?? null,
          evidence: unionEvidence(
            survivor.evidence as unknown as { quote: string }[],
            merged.map((r) => r.evidence as unknown as { quote: string }[]),
          ) as unknown as Prisma.InputJsonValue,
        },
      });
    }

    for (const m of result.merges) {
      await tx.meetingGapFact.update({
        where: { id: m.mergedId },
        data: { mergedIntoId: m.survivorId, deletedAt: new Date() },
      });
    }

    await writeAudit(tx, "GAP", result.merges);
  });

  return { merges: result.merges.length, teamGaps };
}

// ---------------------------------------------------------------------------
// Discussions
// ---------------------------------------------------------------------------

async function consolidateDiscussions(
  orgId: string,
  run: RunRef,
  writeAudit: AuditWriter,
): Promise<number> {
  const rows = await db.meetingDiscussionFact.findMany({
    where: { orgId, runId: run.id, deletedAt: null, mergedIntoId: null },
    orderBy: [{ chunkIdx: "asc" }, { createdAt: "asc" }],
  });
  if (rows.length < 2) return 0;

  const mergeable: MergeableFact[] = rows.map((r) => ({
    id: r.id,
    normalizedKey: r.normalizedKey,
    description: r.summary,
    // Kind is the subject, so a customer-feedback item never merges into a
    // good-news item however similar the wording.
    subject: r.kind,
    chunkIdx: r.chunkIdx,
    fromOverlap: r.fromOverlap,
    confidence: r.confidence,
  }));

  const result = consolidateDeterministic(mergeable);
  if (result.merges.length === 0) return 0;

  const byId = new Map(rows.map((r) => [r.id, r]));

  await db.$transaction(async (tx) => {
    for (const [survivorId, mergedIds] of result.mergedInto) {
      const survivor = byId.get(survivorId);
      if (!survivor) continue;
      const merged = mergedIds
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => Boolean(r));

      const withOutcome = [survivor, ...merged].find((r) => r.outcome);

      await tx.meetingDiscussionFact.update({
        where: { id: survivorId },
        data: {
          outcome: survivor.outcome ?? withOutcome?.outcome ?? null,
          // Deferral is a claim about the whole segment, so one chunk seeing
          // the topic actually discussed overrides another's "skipped".
          wasDeferred: [survivor, ...merged].every((r) => r.wasDeferred),
          evidence: unionEvidence(
            survivor.evidence as unknown as { quote: string }[],
            merged.map((r) => r.evidence as unknown as { quote: string }[]),
          ) as unknown as Prisma.InputJsonValue,
        },
      });
    }

    for (const m of result.merges) {
      await tx.meetingDiscussionFact.update({
        where: { id: m.mergedId },
        data: { mergedIntoId: m.survivorId, deletedAt: new Date() },
      });
    }

    await writeAudit(tx, "DISCUSSION", result.merges);
  });

  return result.merges.length;
}

// ---------------------------------------------------------------------------
// Segment reconstruction
// ---------------------------------------------------------------------------

/**
 * Turn every chunk's parked markers into one verdict per agenda segment.
 *
 * Markers cite turn INDICES, because that is the only anchor a chunk extractor
 * can give reliably; the wall-clock they map to lives on the segment rows. The
 * mapping happens here, once, where the whole transcript is in view.
 *
 * Human flags win over the transcript reading, and a disagreement is recorded
 * rather than smoothed over — `buildSegmentAdherence` owns that rule so this
 * table and the report cannot drift apart.
 */
async function buildSegmentFacts(orgId: string, run: RunRef): Promise<number> {
  const chunks = await db.meetingChunk.findMany({
    where: { orgId, runId: run.id, status: "COMPLETED" },
    orderBy: { idx: "asc" },
    select: { segmentMarkers: true },
  });

  const stored: StoredMarker[] = chunks.flatMap((c) =>
    Array.isArray(c.segmentMarkers)
      ? (c.segmentMarkers as unknown as StoredMarker[])
      : [],
  );
  if (stored.length === 0) return 0;

  const segments = await db.meetingTranscriptSegment.findMany({
    where: { orgId, transcriptId: run.transcriptId },
    orderBy: { idx: "asc" },
    select: { idx: true, startMs: true, endMs: true },
  });
  if (segments.length === 0) return 0;

  const startMsByIdx = new Map(segments.map((s) => [s.idx, s.startMs]));
  const meetingEndMs = segments[segments.length - 1].endMs;

  const markers = stored
    .map((m) => {
      const atMs = startMsByIdx.get(m.atSegmentId);
      // A marker citing a turn that does not exist is unusable. Dropping it is
      // the same rule as an unverifiable quote: a boundary we cannot place
      // would silently move every duration computed from it.
      if (atMs === undefined) return null;
      return {
        segmentKey: m.segmentKey,
        boundary: m.boundary,
        atMs,
        confidence: m.confidence,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null) satisfies SegmentMarker[];
  if (markers.length === 0) return 0;

  const transcript = await db.clientMeetingTranscript.findFirst({
    where: { id: run.transcriptId, orgId },
    select: { weeklyMeetingId: true, meetingDate: true },
  });

  const [client, meeting] = await Promise.all([
    run.clientId
      ? db.client.findFirst({
          where: { id: run.clientId, orgId },
          select: { weeklyAgendaConfig: true },
        })
      : Promise.resolve(null),
    transcript?.weeklyMeetingId
      ? db.clientWeeklyMeeting.findFirst({
          where: { id: transcript.weeklyMeetingId, orgId },
        })
      : Promise.resolve(null),
  ]);

  const agenda = resolveAgenda(client?.weeklyAgendaConfig ?? null);
  const partialKeys = stored.filter((m) => m.partial).map((m) => m.segmentKey);

  const adherence = buildSegmentAdherence({
    agenda,
    markers,
    meeting: (meeting as Record<string, unknown> | null) ?? null,
    meetingEndMs,
    partialKeys,
  });

  // Upserted, not created: consolidation re-runs after a failed chunk is
  // retried, and the second pass must correct the verdict rather than collide
  // with the first. `@@unique([transcriptId, segmentKey])` is what makes that
  // idempotent.
  for (const row of adherence.rows) {
    const data = {
      orgId,
      clientId: run.clientId,
      transcriptId: run.transcriptId,
      runId: run.id,
      meetingDate: transcript?.meetingDate ?? null,
      segmentKey: row.key,
      coverage: row.coverage,
      timeDiscipline: row.timeDiscipline,
      expectedMinutes: row.expectedMinutes,
      actualMinutes: row.actualMinutes,
      startMs: row.startMs,
      endMs: row.endMs,
      humanFlag: row.humanFlag,
      flagAgrees: !row.flagDisagrees,
      comment: row.comment,
      // Evidence lives on the markers, which stay on their chunks; a segment
      // verdict is derived from many of them and quoting one would misrepresent
      // which turn produced the window.
      evidence: [] as unknown as Prisma.InputJsonValue,
    };
    await db.meetingSegmentFact.upsert({
      where: {
        transcriptId_segmentKey: {
          transcriptId: run.transcriptId,
          segmentKey: row.key,
        },
      },
      create: data,
      update: data,
    });
  }

  return adherence.rows.length;
}
