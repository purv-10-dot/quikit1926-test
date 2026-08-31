/**
 * Prepare a transcript for extraction: normalise it, plan its chunks, persist
 * both — and do it idempotently.
 *
 * This is the whole deterministic front half of the long-transcript pipeline
 * (doc 17 §D.1 stage 1). **No model is involved**, so preparing a 6-hour
 * transcript costs nothing but CPU and can be re-run freely.
 *
 * IDEMPOTENCY IS THE POINT
 * ------------------------
 * `MeetingExtractionRun @@unique([orgId, idempotencyKey])` is the guard. The
 * key hashes every version that can change the resulting facts — transcript
 * content, normaliser, chunker, extractor and prompt. So:
 *
 *   · same transcript, same toolchain  → the existing run is returned, and not
 *     one row is rewritten;
 *   · any version bumped, or `rawText` edited → a NEW run, because the old
 *     facts were derived from different input and can no longer be trusted.
 *
 * Without this, every retry of a 3-6 hour meeting would re-plan and re-extract
 * from scratch — which is exactly the cost this architecture exists to avoid.
 *
 * WHY SEGMENTS ARE PERSISTED AT ALL
 * ---------------------------------
 * They could be recomputed on demand, since normalisation is pure. They are
 * stored because they are the FETCH UNIT for chunk extraction: a chunk job
 * reads only its own segment range, so worker memory stays flat regardless of
 * meeting length, and because every extracted fact cites `transcriptSegmentIds`
 * as its evidence anchor — those ids have to be stable and resolvable by
 * primary key long after the run finishes.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";
import {
  extractionIdempotencyKey,
  transcriptSourceHash,
} from "@/lib/reports/fingerprint";

import {
  normalizeTranscript,
  NORMALIZATION_VERSION,
  isDegraded,
  type NormalizeInput,
  type NormalizedTranscript,
  type RawSegmentInput,
} from "./normalize";
import { planChunks, CHUNKER_VERSION, verifyCoverage, type ChunkerOptions } from "./chunker";

/**
 * Version of the fact extractor. Bumping forces re-extraction fleet-wide.
 * Phase 1 has no extractor yet; the constant exists so the idempotency key has
 * its final shape from the start and P2 does not invalidate every P1 run.
 */
export const EXTRACTION_VERSION = 1;

/**
 * Version of the chunk-extraction prompt. Owned here until `lib/ai/prompts/`
 * lands in P2, for the same reason.
 */
export const EXTRACT_PROMPT_VERSION = "chunk-extract@0.1.0-p1";

export interface PrepareOptions extends ChunkerOptions {
  /** Force a fresh run even when the idempotency key matches. */
  force?: boolean;
  /** Plan only — compute everything, write nothing. */
  dryRun?: boolean;
  requestedBy?: string | null;
}

export interface PrepareResult {
  runId: string | null;
  /** True when an existing run matched and nothing was rewritten. */
  reused: boolean;
  idempotencyKey: string;
  segmentCount: number;
  chunkCount: number;
  contentTokens: number;
  promptTokens: number;
  overlapOverheadPct: number;
  contentMs: number;
  timingSource: NormalizedTranscript["timingSource"];
  degraded: boolean;
  normalization: NormalizedTranscript["stats"];
  chunks: {
    idx: number;
    segFromIdx: number;
    segToIdx: number;
    overlapFromIdx: number | null;
    startMs: number;
    endMs: number;
    estTokens: number;
    estPromptTokens: number;
    agendaHint: string | null;
    boundaryReasons: string[];
    oversizeSegment: boolean;
  }[];
}

export class PrepareError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NOT_FOUND"
      | "NO_CONTENT"
      | "COVERAGE_BROKEN",
  ) {
    super(message);
    this.name = "PrepareError";
  }
}

/** The transcript fields preparation needs. */
const TRANSCRIPT_SELECT = {
  id: true,
  orgId: true,
  clientId: true,
  type: true,
  dailyHuddleId: true,
  weeklyMeetingId: true,
  rawText: true,
  rawSegments: true,
  startedAt: true,
  endedAt: true,
  durationMinutes: true,
  sourceHash: true,
  transcriptVersion: true,
} satisfies Prisma.ClientMeetingTranscriptSelect;

type DbLike = PrismaClient | Prisma.TransactionClient;

/**
 * Normalise + chunk a transcript, persisting the result under an idempotent
 * run. Always scoped by `orgId` — a transcript id alone is never sufficient.
 */
export async function prepareTranscript(
  orgId: string,
  transcriptId: string,
  options: PrepareOptions = {},
): Promise<PrepareResult> {
  const transcript = await db.clientMeetingTranscript.findFirst({
    where: { id: transcriptId, orgId, deletedAt: null },
    select: TRANSCRIPT_SELECT,
  });
  if (!transcript) {
    throw new PrepareError("Transcript not found", "NOT_FOUND");
  }

  const rawText = transcript.rawText ?? "";
  const rawSegments = asRawSegments(transcript.rawSegments);
  if (!rawText.trim() && rawSegments.length === 0) {
    throw new PrepareError("Transcript has no content to normalise", "NO_CONTENT");
  }

  // `transcriptVersion` must reflect the CURRENT text. A transcript edited in
  // place (a re-upload, a corrected export) keeps its id, so without this the
  // idempotency key would match the old run and the new content would never be
  // extracted — a silent, invisible staleness.
  const sourceHash = transcriptSourceHash(rawText);
  const versionBumped =
    transcript.sourceHash !== null && transcript.sourceHash !== sourceHash;
  const transcriptVersion = versionBumped
    ? transcript.transcriptVersion + 1
    : transcript.transcriptVersion;

  const input: NormalizeInput = {
    rawText,
    rawSegments: rawSegments.length > 0 ? rawSegments : null,
    startedAt: transcript.startedAt,
    endedAt: transcript.endedAt,
    durationMinutes: transcript.durationMinutes,
  };

  const normalized = normalizeTranscript(input);
  const plan = planChunks(normalized.segments, options);

  // Coverage is an invariant, not a preference: a gap means content silently
  // never reaches the model while the report still claims to be complete.
  // Failing loudly here is far better than discovering it in a finished report.
  const coverage = verifyCoverage(plan, normalized.segments);
  if (!coverage.ok) {
    throw new PrepareError(
      `Chunk plan does not cover the transcript ` +
        `(missing ${coverage.missing.length}, duplicated ${coverage.duplicated.length})`,
      "COVERAGE_BROKEN",
    );
  }

  const idempotencyKey = extractionIdempotencyKey({
    orgId,
    clientId: transcript.clientId,
    transcriptId: transcript.id,
    meetingId: transcript.weeklyMeetingId ?? transcript.dailyHuddleId ?? null,
    transcriptVersion,
    normalizationVersion: NORMALIZATION_VERSION,
    chunkerVersion: CHUNKER_VERSION,
    extractionVersion: EXTRACTION_VERSION,
    extractPromptVersion: EXTRACT_PROMPT_VERSION,
  });

  const summary = buildSummary(normalized, plan, idempotencyKey);

  if (options.dryRun) {
    return { ...summary, runId: null, reused: false };
  }

  // An existing run under the same key means the same transcript prepared by
  // the same toolchain. Reuse it: re-planning is cheap, but rewriting segments
  // would invalidate the `transcriptSegmentIds` that existing facts cite.
  if (!options.force) {
    const existing = await db.meetingExtractionRun.findUnique({
      where: { orgId_idempotencyKey: { orgId, idempotencyKey } },
      select: { id: true },
    });
    if (existing) {
      return { ...summary, runId: existing.id, reused: true };
    }
  }

  const runId = await db.$transaction(async (tx) => {
    const run = await tx.meetingExtractionRun.create({
      data: {
        orgId,
        clientId: transcript.clientId,
        transcriptId: transcript.id,
        meetingId: transcript.weeklyMeetingId ?? transcript.dailyHuddleId ?? null,
        cadence: transcript.type ?? null,
        idempotencyKey,
        transcriptVersion,
        normalizationVersion: NORMALIZATION_VERSION,
        chunkerVersion: CHUNKER_VERSION,
        extractionVersion: EXTRACTION_VERSION,
        extractPromptVersion: EXTRACT_PROMPT_VERSION,
        status: "PENDING",
        stage: "PREPARED",
        chunksTotal: plan.chunks.length,
        segmentsTotal: normalized.segments.length,
        timingSource: normalized.timingSource,
        normalizationStats: normalized.stats as unknown as Prisma.InputJsonValue,
        contentMsTotal: normalized.contentMs,
        contentMsCovered: 0,
        coveragePct: 0,
        requestedBy: options.requestedBy ?? null,
      },
      select: { id: true },
    });

    await replaceSegments(tx, orgId, transcript.clientId, transcript.id, normalized);

    if (plan.chunks.length > 0) {
      await tx.meetingChunk.createMany({
        data: plan.chunks.map((c) => ({
          orgId,
          clientId: transcript.clientId,
          transcriptId: transcript.id,
          runId: run.id,
          idx: c.idx,
          segFromIdx: c.segFromIdx,
          segToIdx: c.segToIdx,
          overlapFromIdx: c.overlapFromIdx,
          startMs: c.startMs,
          endMs: c.endMs,
          estTokens: c.estTokens,
          estPromptTokens: c.estPromptTokens,
          boundaryScore: c.boundaryScore,
          boundaryReasons: c.boundaryReasons,
          agendaHint: c.agendaHint,
          oversizeSegment: c.oversizeSegment,
          status: "PENDING",
        })),
      });
    }

    await tx.clientMeetingTranscript.update({
      where: { id: transcript.id },
      data: {
        sourceHash,
        transcriptVersion,
        estTokens: normalized.estTokens,
        normalizationVersion: NORMALIZATION_VERSION,
        normalizationStats: normalized.stats as unknown as Prisma.InputJsonValue,
        timingSource: normalized.timingSource,
        extractionStatus: isDegraded(normalized) ? "DEGRADED" : "NOT_STARTED",
      },
    });

    return run.id;
  });

  return { ...summary, runId, reused: false };
}

/**
 * Replace a transcript's segments.
 *
 * Delete-then-insert rather than upsert: segment indices are dense and derived
 * from the whole transcript, so a re-normalisation can legitimately produce
 * FEWER segments, and leftover rows from a previous run would corrupt every
 * chunk range that references them. Both statements run inside the caller's
 * transaction, so there is no window where a transcript has partial segments.
 */
async function replaceSegments(
  tx: DbLike,
  orgId: string,
  clientId: string | null,
  transcriptId: string,
  normalized: NormalizedTranscript,
): Promise<void> {
  await tx.meetingTranscriptSegment.deleteMany({ where: { orgId, transcriptId } });
  if (normalized.segments.length === 0) return;

  await tx.meetingTranscriptSegment.createMany({
    data: normalized.segments.map((s) => ({
      orgId,
      clientId,
      transcriptId,
      idx: s.idx,
      startMs: s.startMs,
      endMs: s.endMs,
      speakerRaw: s.speakerRaw,
      text: s.text,
      charCount: s.charCount,
      estTokens: s.estTokens,
      timingInterpolated: s.timingInterpolated,
    })),
  });
}

function buildSummary(
  normalized: NormalizedTranscript,
  plan: ReturnType<typeof planChunks>,
  idempotencyKey: string,
): Omit<PrepareResult, "runId" | "reused"> {
  return {
    idempotencyKey,
    segmentCount: normalized.segments.length,
    chunkCount: plan.chunks.length,
    contentTokens: plan.contentTokens,
    promptTokens: plan.promptTokens,
    overlapOverheadPct: plan.overlapOverheadPct,
    contentMs: normalized.contentMs,
    timingSource: normalized.timingSource,
    degraded: isDegraded(normalized),
    normalization: normalized.stats,
    chunks: plan.chunks.map((c) => ({
      idx: c.idx,
      segFromIdx: c.segFromIdx,
      segToIdx: c.segToIdx,
      overlapFromIdx: c.overlapFromIdx,
      startMs: c.startMs,
      endMs: c.endMs,
      estTokens: c.estTokens,
      estPromptTokens: c.estPromptTokens,
      agendaHint: c.agendaHint,
      boundaryReasons: c.boundaryReasons,
      oversizeSegment: c.oversizeSegment,
    })),
  };
}

/** Coerce the stored JSON into the structured-segment shape, defensively. */
function asRawSegments(value: unknown): RawSegmentInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((v) => ({
      speaker: typeof v.speaker === "string" ? v.speaker : null,
      text: typeof v.text === "string" ? v.text : null,
      timestamp:
        typeof v.timestamp === "number" || typeof v.timestamp === "string"
          ? v.timestamp
          : null,
    }));
}
