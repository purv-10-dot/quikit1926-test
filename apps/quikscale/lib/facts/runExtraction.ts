/**
 * Run an extraction: fan out over chunks, gate on coverage, consolidate, persist.
 *
 * Stages 1–2 of doc 17 §D.1, minus the queue. Chunks are processed
 * sequentially here because this runs inside a Vercel request, which is
 * sufficient for a Daily Huddle (exactly one chunk, ~30 s) and is the
 * deliberate fallback path for everything else. A 3–6 hour Weekly Meeting is
 * 15–30 chunks and belongs on the QuikFlow worker (P5) — the orchestration
 * below is written so that moving it there changes only the loop, not the
 * semantics.
 *
 * RESUMABILITY IS FREE
 * --------------------
 * Chunk status lives in Postgres, so a run that dies half way through resumes
 * by processing only its PENDING chunks. COMPLETED chunks are never re-run and
 * never re-billed. That is why `MeetingChunk.status` — not Redis, not a
 * BullMQ flow — is the source of truth.
 *
 * THE COVERAGE GATE
 * -----------------
 * Coverage is TIME-weighted, not chunk-count-weighted: a failed 12-minute chunk
 * matters more than a failed 3-minute one. Three outcomes:
 *
 *   100%                  COMPLETED
 *   MIN_COVERAGE..<100%   PARTIAL — the report may generate, but it names its
 *                         missing windows and cannot be signed off
 *   < MIN_COVERAGE        FAILED  — no report at all
 *
 * Nothing is ever extrapolated over missing content. A 92%-coverage meeting
 * reports what it saw and says what it did not.
 */

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { LlmUnavailableError, LlmValidationError } from "@/lib/ai/llm";
import type { RosterHint } from "@/lib/ai/prompts/chunkExtract";
import type { NormalizedSegment } from "@/lib/meetings/normalize";

import { extractChunk, type ExtractChunkResult } from "./extractChunk";
import {
  consolidateDeterministic,
  occurrenceCount,
  unionEvidence,
  type MergeableFact,
  type MergeDecision,
} from "./consolidate";
import { consolidateWeekly } from "./consolidateWeekly";
import { stampTopics } from "./stampTopics";
import { EXTRACTION_VERSION } from "@/lib/meetings/prepareTranscript";

/**
 * Below this, no report is generated. A business rule as much as a technical
 * one — doc 17 open question 22 asks the facilitator to confirm whether a
 * PARTIAL report is acceptable at all.
 */
export const MIN_COVERAGE_PCT = Number(process.env.MIN_COVERAGE_PCT) || 85;

/** How long a chunk may be held before another worker may reclaim it. */
const CHUNK_LEASE_MS = 10 * 60 * 1000;

export interface RunExtractionOptions {
  /** Stop after this many chunks; the rest stay PENDING for the next pass. */
  maxChunks?: number;
  signal?: AbortSignal;
  /** Re-run chunks that previously FAILED. */
  retryFailed?: boolean;
}

export interface RunExtractionResult {
  runId: string;
  status: "COMPLETED" | "PARTIAL" | "FAILED" | "EXTRACTING";
  chunksTotal: number;
  chunksCompleted: number;
  chunksFailed: number;
  chunksRemaining: number;
  coveragePct: number;
  /** Time ranges that could not be extracted, for the report's banner. */
  missingWindows: { startMs: number; endMs: number }[];
  factCounts: { participants: number; stucks: number; www: number };
  merges: number;
  evidenceDropped: number;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
}

export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly code: "RUN_NOT_FOUND" | "NO_CHUNKS" | "BELOW_MIN_COVERAGE",
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

/**
 * Process a prepared run.
 *
 * A chunk that fails permanently does NOT fail the run — it lowers coverage,
 * and the gate decides. That is the difference between "we lost four minutes of
 * a two-hour meeting" and "we lost the meeting".
 */
export async function runExtraction(
  orgId: string,
  runId: string,
  options: RunExtractionOptions = {},
): Promise<RunExtractionResult> {
  const run = await db.meetingExtractionRun.findFirst({
    where: { id: runId, orgId },
  });
  if (!run) throw new ExtractionError("Extraction run not found", "RUN_NOT_FOUND");

  const allChunks = await db.meetingChunk.findMany({
    where: { orgId, runId },
    orderBy: { idx: "asc" },
  });
  if (allChunks.length === 0) {
    throw new ExtractionError("Run has no chunks to extract", "NO_CHUNKS");
  }

  const pending = allChunks.filter(
    (c) => c.status === "PENDING" || (options.retryFailed && c.status === "FAILED"),
  );
  const todo = options.maxChunks ? pending.slice(0, options.maxChunks) : pending;

  if (todo.length > 0) {
    await db.meetingExtractionRun.update({
      where: { id: runId },
      data: { status: "EXTRACTING", stage: "EXTRACTING", startedAt: run.startedAt ?? new Date() },
    });
  }

  // Segments are loaded ONCE for the whole run rather than per chunk. For a
  // 6-hour meeting that is ~3,000 rows / a few MB — well within budget, and it
  // avoids 30 round trips. The worker path (P5) fetches per chunk instead,
  // because there each chunk is a separate process.
  const segments = await loadSegments(orgId, run.transcriptId);
  const roster = await loadRoster(orgId, run.clientId);
  const cadence: "DAILY" | "WEEKLY" = run.cadence === "WEEKLY" ? "WEEKLY" : "DAILY";

  let tokensInput = 0;
  let tokensOutput = 0;
  let costUsd = 0;
  let evidenceDropped = 0;

  for (const chunk of todo) {
    if (options.signal?.aborted) break;

    // Claim the chunk. The lease is what lets a crashed run be reclaimed
    // without double-extracting a chunk that is genuinely in flight.
    const claimed = await db.meetingChunk.updateMany({
      where: {
        id: chunk.id,
        status: options.retryFailed ? { in: ["PENDING", "FAILED"] } : "PENDING",
      },
      data: {
        status: "PROCESSING",
        startedAt: new Date(),
        lockedUntil: new Date(Date.now() + CHUNK_LEASE_MS),
        attempts: { increment: 1 },
      },
    });
    if (claimed.count === 0) continue; // someone else took it

    const promptSegments = segments.filter(
      (s) => s.idx >= (chunk.overlapFromIdx ?? chunk.segFromIdx) && s.idx <= chunk.segToIdx,
    );

    try {
      const extracted = await extractChunk({
        orgId,
        clientId: run.clientId,
        transcriptId: run.transcriptId,
        runId,
        chunkIdx: chunk.idx,
        cadence,
        segments: promptSegments,
        contentFromIdx: chunk.segFromIdx,
        contentToIdx: chunk.segToIdx,
        roster,
        meetingDate: run.createdAt.toISOString().slice(0, 10),
        timingsInterpolated: run.timingSource !== "EXPLICIT",
        signal: options.signal,
      });

      tokensInput += extracted.usage.inputTokens;
      tokensOutput += extracted.usage.outputTokens;
      costUsd += extracted.usage.costUsd;
      evidenceDropped += extracted.verification.factsDropped;

      // Facts and the chunk's COMPLETED status are written together. A partial
      // write — facts stored but the chunk still PENDING — would duplicate them
      // on the next pass.
      await db.$transaction(async (tx) => {
        await persistChunkFacts(tx, { orgId, run, chunk, extracted });
        await tx.meetingChunk.update({
          where: { id: chunk.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            lockedUntil: null,
            lastError: null,
            tokensInput: extracted.usage.inputTokens,
            tokensOutput: extracted.usage.outputTokens,
            costUsd: extracted.usage.costUsd,
            // Parked, not promoted: a START here may pair with an END three
            // chunks away, so segment verdicts are built once at consolidation.
            segmentMarkers: extracted.segmentMarkers.length
              ? (extracted.segmentMarkers as unknown as Prisma.InputJsonValue)
              : undefined,
            // Parked for the same reason. One chunk's topic list says little;
            // the union across a meeting is what lets consolidation group facts
            // by workstream, which is what makes reduction meaningful.
            topicsOpen: extracted.topicsOpen,
          },
        });
      });
    } catch (err) {
      // The run continues. Coverage drops and the gate decides — losing four
      // minutes of a two-hour meeting must not lose the meeting.
      const message =
        err instanceof LlmValidationError
          ? `Schema validation failed: ${err.issues.slice(0, 3).join("; ")}`
          : err instanceof LlmUnavailableError
            ? `Model unavailable: ${err.message}`
            : err instanceof Error
              ? err.message
              : "Unknown extraction error";

      await db.meetingChunk.update({
        where: { id: chunk.id },
        data: { status: "FAILED", lastError: message.slice(0, 1000), lockedUntil: null },
      });
    }
  }

  return finaliseRun(orgId, runId, { tokensInput, tokensOutput, costUsd, evidenceDropped });
}

/**
 * Apply the coverage gate, consolidate, and record the outcome.
 *
 * Separated from the extraction loop so the worker path can call it after its
 * own fan-in without duplicating the gate logic.
 */
export async function finaliseRun(
  orgId: string,
  runId: string,
  usage: {
    tokensInput: number;
    tokensOutput: number;
    costUsd: number;
    evidenceDropped: number;
  },
): Promise<RunExtractionResult> {
  const run = await db.meetingExtractionRun.findFirstOrThrow({ where: { id: runId, orgId } });
  const chunks = await db.meetingChunk.findMany({
    where: { orgId, runId },
    orderBy: { idx: "asc" },
  });

  const completed = chunks.filter((c) => c.status === "COMPLETED");
  const failed = chunks.filter((c) => c.status === "FAILED");
  const remaining = chunks.filter((c) => c.status === "PENDING" || c.status === "PROCESSING");

  // TIME-weighted, not count-weighted: a failed 12-minute chunk matters more
  // than a failed 3-minute one, and a count would treat them identically.
  const spanOf = (c: { startMs: number; endMs: number }) => Math.max(0, c.endMs - c.startMs);
  const totalMs = chunks.reduce((n, c) => n + spanOf(c), 0);
  const coveredMs = completed.reduce((n, c) => n + spanOf(c), 0);
  const coveragePct = totalMs > 0 ? Math.round((coveredMs / totalMs) * 1000) / 10 : 0;

  const missingWindows = [...failed, ...remaining]
    .sort((a, b) => a.startMs - b.startMs)
    .map((c) => ({ startMs: c.startMs, endMs: c.endMs }));

  let status: RunExtractionResult["status"];
  if (remaining.length > 0) status = "EXTRACTING";
  else if (coveragePct >= 100) status = "COMPLETED";
  else if (coveragePct >= MIN_COVERAGE_PCT) status = "PARTIAL";
  else status = "FAILED";

  // Consolidate only once every chunk has been attempted — merging a partial
  // fact set would produce occurrence counts that change as more chunks land.
  let merges = 0;
  if (remaining.length === 0) {
    merges = await consolidateRun(orgId, run);
  }

  const [participants, stucks, www] = await Promise.all([
    db.meetingParticipantFact.count({ where: { orgId, runId, deletedAt: null } }),
    db.meetingStuckFact.count({ where: { orgId, runId, deletedAt: null } }),
    db.meetingWwwFact.count({ where: { orgId, runId, deletedAt: null } }),
  ]);

  await db.meetingExtractionRun.update({
    where: { id: runId },
    data: {
      status,
      stage: remaining.length === 0 ? "CONSOLIDATED" : "EXTRACTING",
      chunksTotal: chunks.length,
      chunksCompleted: completed.length,
      chunksFailed: failed.length,
      contentMsTotal: totalMs,
      contentMsCovered: coveredMs,
      coveragePct,
      tokensInput: { increment: usage.tokensInput },
      tokensOutput: { increment: usage.tokensOutput },
      costUsd: { increment: usage.costUsd },
      finishedAt: remaining.length === 0 ? new Date() : null,
      error:
        status === "FAILED" && remaining.length === 0
          ? `Coverage ${coveragePct}% is below the ${MIN_COVERAGE_PCT}% minimum`
          : null,
    },
  });

  if (remaining.length === 0) {
    await db.clientMeetingTranscript.update({
      where: { id: run.transcriptId },
      data: {
        extractionStatus: status,
        extractedAt: new Date(),
        extractionVersion: EXTRACTION_VERSION,
      },
    });
  }

  return {
    runId,
    status,
    chunksTotal: chunks.length,
    chunksCompleted: completed.length,
    chunksFailed: failed.length,
    chunksRemaining: remaining.length,
    coveragePct,
    missingWindows,
    factCounts: { participants, stucks, www },
    merges,
    evidenceDropped: usage.evidenceDropped,
    tokensInput: usage.tokensInput,
    tokensOutput: usage.tokensOutput,
    costUsd: usage.costUsd,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;

interface PersistArgs {
  orgId: string;
  run: { id: string; clientId: string | null; transcriptId: string; cadence: string | null };
  chunk: { idx: number };
  extracted: ExtractChunkResult;
}

async function persistChunkFacts(tx: Tx, args: PersistArgs): Promise<void> {
  const { orgId, run, chunk, extracted } = args;
  const common = {
    orgId,
    clientId: run.clientId,
    transcriptId: run.transcriptId,
    runId: run.id,
    cadence: run.cadence,
    chunkIdx: chunk.idx,
    extractionVersion: EXTRACTION_VERSION,
    promptVersion: extracted.promptVersion,
    modelId: extracted.model,
  };

  if (extracted.participants.length) {
    await tx.meetingParticipantFact.createMany({
      data: extracted.participants.map((p) => ({
        ...common,
        speakerRaw: p.speakerRaw,
        achievementText: p.achievement.text,
        achievementAdherence: p.achievement.adherence,
        achievementQuality: p.achievement.quality,
        achievementEvidence: p.achievement.evidence as unknown as Prisma.InputJsonValue,
        focusText: p.focus.text,
        focusAdherence: p.focus.adherence,
        focusQuality: p.focus.quality,
        focusEvidence: p.focus.evidence as unknown as Prisma.InputJsonValue,
        stuckText: p.stuck.text,
        stuckAdherence: p.stuck.adherence,
        stuckQuality: p.stuck.quality,
        stuckEvidence: p.stuck.evidence as unknown as Prisma.InputJsonValue,
        noStuck: p.noStuck,
        confidence: p.confidence,
        fromOverlap: p.fromOverlap,
      })),
    });
  }

  if (extracted.stucks.length) {
    await tx.meetingStuckFact.createMany({
      data: extracted.stucks.map((s) => ({
        ...common,
        raisedByRaw: s.raisedByRaw,
        raisedForRaw: s.raisedForRaw,
        description: s.description,
        normalizedKey: s.normalizedKey,
        category: s.category,
        statusStated: s.statusStated,
        evidence: s.evidence as unknown as Prisma.InputJsonValue,
        confidence: s.confidence,
        fromOverlap: s.fromOverlap,
      })),
    });
  }

  if (extracted.kpiReads.length) {
    await tx.meetingKpiFact.createMany({
      data: extracted.kpiReads.map((k) => ({
        ...common,
        speakerRaw: k.speakerRaw,
        kpiRag: k.kpiRag,
        priorityRag: k.priorityRag,
        keyPoints: k.keyPoints,
        evidence: k.evidence as unknown as Prisma.InputJsonValue,
        confidence: k.confidence,
        fromOverlap: k.fromOverlap,
      })),
    });
  }

  if (extracted.gaps.length) {
    await tx.meetingGapFact.createMany({
      data: extracted.gaps.map((g) => ({
        ...common,
        gap: g.gap,
        normalizedKey: g.normalizedKey,
        agreedAction: g.agreedAction,
        ownerRaw: g.ownerRaw,
        scope: g.scope,
        raisedByRaw: g.raisedByRaw,
        severityStated: g.severityStated,
        evidence: g.evidence as unknown as Prisma.InputJsonValue,
        confidence: g.confidence,
        fromOverlap: g.fromOverlap,
      })),
    });
  }

  if (extracted.discussions.length) {
    await tx.meetingDiscussionFact.createMany({
      data: extracted.discussions.map((d) => ({
        ...common,
        kind: d.kind,
        sharedByRaw: d.sharedByRaw,
        summary: d.summary,
        normalizedKey: d.normalizedKey,
        outcome: d.outcome,
        wasDeferred: d.wasDeferred,
        evidence: d.evidence as unknown as Prisma.InputJsonValue,
        confidence: d.confidence,
        fromOverlap: d.fromOverlap,
      })),
    });
  }

  if (extracted.wwwCandidates.length) {
    await tx.meetingWwwFact.createMany({
      data: extracted.wwwCandidates.map((w) => ({
        ...common,
        whoRaw: w.whoRaw,
        what: w.what,
        normalizedKey: w.normalizedKey,
        whenText: w.whenText,
        whenMissing: w.whenMissing,
        completeness: w.completeness,
        evidence: w.evidence as unknown as Prisma.InputJsonValue,
        confidence: w.confidence,
        fromOverlap: w.fromOverlap,
      })),
    });
  }
}

// ---------------------------------------------------------------------------
// Consolidation
// ---------------------------------------------------------------------------

/**
 * Merge duplicate facts across chunks and record every decision.
 *
 * Runs the two deterministic stages only. Stage 3 (bounded LLM adjudication of
 * the ambiguous band) is deliberately not wired here: it is worth one call per
 * meeting, but only once the deterministic thresholds have been tuned against
 * real transcripts, and doing it blind risks the over-merge failure that this
 * design is most careful about. The candidate pairs are counted so the volume
 * is visible before it is acted on.
 */
async function consolidateRun(
  orgId: string,
  run: { id: string; clientId: string | null; transcriptId: string },
): Promise<number> {
  const { transcriptId, id: runId } = run;
  let total = 0;

  total += await consolidateStucks(orgId, transcriptId, runId);
  total += await consolidateWww(orgId, transcriptId, runId);

  // Weekly-Meeting types. No cadence branch: on a daily run every one of these
  // finds zero rows and returns immediately, which keeps a single consolidation
  // path exercised by both cadences instead of a WEEKLY-only path that is only
  // ever tested once a week.
  const weekly = await consolidateWeekly(orgId, run, (tx, factType, merges) =>
    writeMergeAudit(tx, orgId, transcriptId, runId, factType, merges),
  );
  total += weekly.merges;

  // Topics are stamped LAST, over survivors only. Doing it before merging would
  // topic one fact per chunk that heard it, then merge them and keep whichever
  // topic the survivor happened to carry.
  await stampTopics(orgId, run);

  return total;
}

async function consolidateStucks(
  orgId: string,
  transcriptId: string,
  runId: string,
): Promise<number> {
  const rows = await db.meetingStuckFact.findMany({
    where: { orgId, runId, deletedAt: null, mergedIntoId: null },
    orderBy: [{ chunkIdx: "asc" }, { createdAt: "asc" }],
  });
  if (rows.length < 2) return 0;

  const mergeable: MergeableFact[] = rows.map((r) => ({
    id: r.id,
    normalizedKey: r.normalizedKey,
    description: r.description,
    // Two people raising the same blocker is two facts — that is a signal about
    // how widely the problem is felt, not a duplicate.
    subject: r.raisedByRaw?.toLowerCase() ?? null,
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

      // Evidence from every merged fact is unioned into the survivor. Losing it
      // would turn a recurring issue into a single mention.
      const mergedEvidence = mergedIds
        .map((id) => byId.get(id)?.evidence)
        .filter(Boolean)
        .map((e) => e as unknown as { quote: string }[]);

      await tx.meetingStuckFact.update({
        where: { id: survivorId },
        data: {
          evidence: unionEvidence(
            survivor.evidence as unknown as { quote: string }[],
            mergedEvidence,
          ) as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // Soft delete, never hard: a bad merge must stay inspectable and reversible.
    for (const m of result.merges) {
      await tx.meetingStuckFact.update({
        where: { id: m.mergedId },
        data: { mergedIntoId: m.survivorId, deletedAt: new Date() },
      });
    }

    await writeMergeAudit(tx, orgId, transcriptId, runId, "STUCK", result.merges);
  });

  return result.merges.length;
}

async function consolidateWww(
  orgId: string,
  transcriptId: string,
  runId: string,
): Promise<number> {
  const rows = await db.meetingWwwFact.findMany({
    where: { orgId, runId, deletedAt: null, mergedIntoId: null },
    orderBy: [{ chunkIdx: "asc" }, { createdAt: "asc" }],
  });
  if (rows.length < 2) return 0;

  const mergeable: MergeableFact[] = rows.map((r) => ({
    id: r.id,
    normalizedKey: r.normalizedKey,
    description: r.what,
    subject: r.whoRaw?.toLowerCase() ?? null,
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

      const merged = mergedIds.map((id) => byId.get(id)).filter(Boolean);

      // A date stated anywhere wins over silence. The same commitment can be
      // made vaguely in one chunk and dated in another; taking the dated
      // version is recovering information, not inventing it.
      const dated = [survivor, ...merged].find((r) => r && !r.whenMissing);

      await tx.meetingWwwFact.update({
        where: { id: survivorId },
        data: {
          evidence: unionEvidence(
            survivor.evidence as unknown as { quote: string }[],
            merged.map((r) => r?.evidence as unknown as { quote: string }[]),
          ) as unknown as Prisma.InputJsonValue,
          ...(dated && dated.id !== survivorId
            ? {
                whenText: dated.whenText,
                whenMissing: false,
                completeness: dated.completeness,
              }
            : {}),
        },
      });
    }

    for (const m of result.merges) {
      await tx.meetingWwwFact.update({
        where: { id: m.mergedId },
        data: { mergedIntoId: m.survivorId, deletedAt: new Date() },
      });
    }

    await writeMergeAudit(tx, orgId, transcriptId, runId, "WWW", result.merges);
  });

  return result.merges.length;
}

async function writeMergeAudit(
  tx: Tx,
  orgId: string,
  transcriptId: string,
  runId: string,
  factType: string,
  merges: MergeDecision[],
): Promise<void> {
  if (merges.length === 0) return;
  await tx.meetingFactMerge.createMany({
    data: merges.map((m) => ({
      orgId,
      transcriptId,
      runId,
      factType,
      survivorFactId: m.survivorId,
      mergedFactId: m.mergedId,
      rule: m.rule,
      similarity: m.similarity,
      decidedBy: m.decidedBy,
      confidence: m.confidence,
    })),
  });
}

/** Occurrence count for a consolidated fact, for the report's recurrence table. */
export { occurrenceCount };

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

async function loadSegments(
  orgId: string,
  transcriptId: string,
): Promise<NormalizedSegment[]> {
  const rows = await db.meetingTranscriptSegment.findMany({
    where: { orgId, transcriptId },
    orderBy: { idx: "asc" },
    select: {
      idx: true,
      startMs: true,
      endMs: true,
      speakerRaw: true,
      text: true,
      charCount: true,
      estTokens: true,
      timingInterpolated: true,
    },
  });
  return rows;
}

/**
 * Roster hints for the prompt.
 *
 * Context only — it helps the model recognise who is speaking. It never
 * licenses renaming: `speakerRaw` is still reported exactly as the transcript
 * labels it, and resolution to a member happens deterministically afterwards.
 */
async function loadRoster(orgId: string, clientId: string | null): Promise<RosterHint[]> {
  if (!clientId) return [];

  const links = await db.clientTeamMember.findMany({
    where: { clientId },
    select: {
      member: {
        select: { id: true, name: true, role: true, aliases: { select: { alias: true } } },
      },
    },
  });

  return links
    .map((l) => l.member)
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .map((m) => ({
      name: m.name,
      role: m.role,
      aliases: m.aliases.map((a: { alias: string }) => a.alias),
    }));
}
