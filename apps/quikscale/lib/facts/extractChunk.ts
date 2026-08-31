/**
 * Extract facts from ONE chunk.
 *
 * The single unit of LLM work in the pipeline (doc 17 §D.5). Everything about
 * it is scoped to one chunk so that a failure costs one chunk: it reads only
 * its own segment range, writes only its own facts, and is retried alone.
 *
 * THE PIPELINE INSIDE ONE CALL
 * ----------------------------
 *   build prompt (prefix-stable)
 *        ↓
 *   generateStructured → Zod validation → one repair retry   [lib/ai/llm.ts]
 *        ↓
 *   evidence verification: every quote must appear in the cited turns
 *        ↓
 *   drop unverifiable facts, keep the rest
 *
 * Nothing unverified survives. A fact whose quote is not in the transcript is
 * removed rather than flagged (doc 17 D11) — a report the facilitator has to
 * fact-check is worth less than a shorter true one — and every drop is counted
 * so the rate is visible rather than silent.
 *
 * This module does not touch the database. It takes segments and returns facts,
 * which keeps it testable without a DB and lets the orchestrator own all
 * persistence and transaction boundaries.
 */

import { generateStructured, type AiFeature } from "@/lib/ai/llm";
import {
  buildChunkExtractPrompt,
  PROMPT_VERSION,
  type RosterHint,
} from "@/lib/ai/prompts/chunkExtract";
import {
  accumulate,
  emptyStats,
  verifyFactEvidence,
  type SegmentText,
  type VerificationStats,
} from "@/lib/ai/evidenceVerifier";
import type { NormalizedSegment } from "@/lib/meetings/normalize";

import {
  chunkExtractionSchema,
  chunkExtractionResponseSchema,
  type ChunkExtraction,
  type ParticipantFactInput,
  type StuckFactInput,
  type WwwFactInput,
  type SegmentMarkerInput,
  type KpiFactInput,
  type GapFactInput,
  type DiscussionFactInput,
} from "./schemas";
import { normalizeKey } from "./consolidate";

export const EXTRACT_FEATURE: AiFeature = "CHUNK_EXTRACT";

export interface ExtractChunkInput {
  orgId: string;
  clientId: string | null;
  transcriptId: string;
  runId: string;
  chunkIdx: number;
  cadence: "DAILY" | "WEEKLY";
  /** Segments to send: the chunk's own content plus any overlap context. */
  segments: NormalizedSegment[];
  /** Inclusive range of the chunk's OWN content. */
  contentFromIdx: number;
  contentToIdx: number;
  roster?: RosterHint[];
  meetingDate?: string | null;
  timingsInterpolated?: boolean;
  signal?: AbortSignal;
  traceId?: string;
}

/** A participant fact after verification, ready to persist. */
export interface VerifiedParticipant extends ParticipantFactInput {
  /** True when every dimension's evidence came from overlap context only. */
  fromOverlap: boolean;
}

export interface VerifiedStuck extends StuckFactInput {
  normalizedKey: string;
  fromOverlap: boolean;
}

export interface VerifiedWww extends WwwFactInput {
  normalizedKey: string;
  fromOverlap: boolean;
}

export interface VerifiedSegmentMarker extends SegmentMarkerInput {
  fromOverlap: boolean;
}

export interface VerifiedKpi extends KpiFactInput {
  fromOverlap: boolean;
}

export interface VerifiedGap extends GapFactInput {
  normalizedKey: string;
  fromOverlap: boolean;
}

export interface VerifiedDiscussion extends DiscussionFactInput {
  normalizedKey: string;
  fromOverlap: boolean;
}

export interface ExtractChunkResult {
  participants: VerifiedParticipant[];
  stucks: VerifiedStuck[];
  wwwCandidates: VerifiedWww[];
  segmentMarkers: VerifiedSegmentMarker[];
  kpiReads: VerifiedKpi[];
  gaps: VerifiedGap[];
  discussions: VerifiedDiscussion[];
  speakersSeen: string[];
  topicsOpen: string[];
  truncated: boolean;
  verification: VerificationStats;
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
  model: string;
  promptVersion: string;
  repaired: boolean;
  traceId: string;
}

/**
 * Was every cited segment outside this chunk's own range?
 *
 * A fact supported only by overlap context belongs to the PREVIOUS chunk, which
 * already extracted it. Marking it lets consolidation prefer the owning chunk's
 * copy so overlap never inflates counts.
 */
function isFromOverlap(
  evidence: { transcriptSegmentIds: number[] }[],
  contentFromIdx: number,
  contentToIdx: number,
): boolean {
  const ids = evidence.flatMap((e) => e.transcriptSegmentIds);
  if (ids.length === 0) return false;
  return ids.every((i) => i < contentFromIdx || i > contentToIdx);
}

/**
 * Extract and verify one chunk.
 *
 * Throws only when the model call itself fails past its retries (the caller
 * marks the chunk FAILED and the run continues, degrading coverage rather than
 * dying). A chunk that returns nothing usable is a SUCCESS with zero facts —
 * silence in a transcript is a legitimate result.
 */
export async function extractChunk(
  input: ExtractChunkInput,
): Promise<ExtractChunkResult> {
  const prompt = buildChunkExtractPrompt({
    segments: input.segments,
    contentFromIdx: input.contentFromIdx,
    contentToIdx: input.contentToIdx,
    cadence: input.cadence,
    roster: input.roster,
    meetingDate: input.meetingDate,
    timingsInterpolated: input.timingsInterpolated,
  });

  const result = await generateStructured<ChunkExtraction>({
    orgId: input.orgId,
    clientId: input.clientId,
    feature: EXTRACT_FEATURE,
    promptVersion: PROMPT_VERSION,
    prompt,
    transcriptId: input.transcriptId,
    runId: input.runId,
    chunkIdx: input.chunkIdx,
    schema: chunkExtractionSchema,
    responseSchema: chunkExtractionResponseSchema,
    signal: input.signal,
    traceId: input.traceId,
  });

  const segmentTexts: SegmentText[] = input.segments.map((s) => ({
    idx: s.idx,
    text: s.text,
  }));

  const verification = emptyStats();
  const { contentFromIdx, contentToIdx } = input;

  // ── participants ────────────────────────────────────────────────────────
  // A participant fact has three independently-evidenced dimensions. One
  // dimension failing verification does not invalidate the other two, so each
  // is verified separately and a failed dimension is downgraded to "not
  // addressed" rather than taking the whole member's update down with it.
  const participants: VerifiedParticipant[] = [];

  /**
   * Verify one dimension, keeping only the quotes that hold up.
   *
   * A dimension that cannot be substantiated is downgraded to "not given"
   * rather than asserting a classification we cannot back with a quote — and
   * rather than discarding the member's whole update, which would lose the two
   * dimensions that were fine.
   */
  const verifyDimension = <D extends { adherence: string; quality: string; evidence: unknown[] }>(
    dim: D,
    absentQuality: D["quality"],
  ): { dim: D; passed: boolean } => {
    const v = verifyFactEvidence(
      dim.evidence as { quote: string; transcriptSegmentIds: number[] }[],
      segmentTexts,
    );
    accumulate(verification, v);
    if (v.passed) {
      return { dim: { ...dim, evidence: v.keptEvidence }, passed: true };
    }
    return {
      dim: { ...dim, text: null, adherence: "NO", quality: absentQuality, evidence: [] },
      passed: false,
    };
  };

  for (const p of result.data.participants) {
    const achievement = verifyDimension(p.achievement, "NONE");
    const focus = verifyDimension(p.focus, "NONE");
    const stuck = verifyDimension(p.stuck, "NOT_ADDRESSED");

    // Nothing about this member could be substantiated at all.
    if (!achievement.passed && !focus.passed && !stuck.passed) continue;

    participants.push({
      ...p,
      achievement: achievement.dim,
      focus: focus.dim,
      stuck: stuck.dim,
      fromOverlap: isFromOverlap(
        [
          ...achievement.dim.evidence,
          ...focus.dim.evidence,
          ...stuck.dim.evidence,
        ],
        contentFromIdx,
        contentToIdx,
      ),
    });
  }

  // ── stucks ──────────────────────────────────────────────────────────────
  const stucks: VerifiedStuck[] = [];
  for (const s of result.data.stucks) {
    const v = verifyFactEvidence(s.evidence, segmentTexts);
    accumulate(verification, v);
    if (!v.passed) continue;
    stucks.push({
      ...s,
      evidence: v.keptEvidence,
      normalizedKey: normalizeKey(s.description),
      fromOverlap: isFromOverlap(v.keptEvidence, contentFromIdx, contentToIdx),
    });
  }

  // ── WWW candidates ──────────────────────────────────────────────────────
  const wwwCandidates: VerifiedWww[] = [];
  for (const w of result.data.wwwCandidates) {
    const v = verifyFactEvidence(w.evidence, segmentTexts);
    accumulate(verification, v);
    if (!v.passed) continue;
    wwwCandidates.push({
      ...w,
      evidence: v.keptEvidence,
      // Keyed on the action, not the owner: the same action assigned to two
      // people is one action with an ownership question, and keying on both
      // would hide that.
      normalizedKey: normalizeKey(w.what),
      fromOverlap: isFromOverlap(v.keptEvidence, contentFromIdx, contentToIdx),
    });
  }

  // ── weekly-meeting facts ────────────────────────────────────────────────
  // Same rule as everything else: no quote, no fact. A segment marker without
  // evidence would silently move an agenda boundary and, through it, every
  // computed segment duration — so it is dropped like any other claim.
  const segmentMarkers: VerifiedSegmentMarker[] = [];
  for (const m of result.data.segmentMarkers) {
    const v = verifyFactEvidence(m.evidence, segmentTexts);
    accumulate(verification, v);
    if (!v.passed) continue;
    segmentMarkers.push({
      ...m,
      evidence: v.keptEvidence,
      fromOverlap: isFromOverlap(v.keptEvidence, contentFromIdx, contentToIdx),
    });
  }

  const kpiReads: VerifiedKpi[] = [];
  for (const k of result.data.kpiReads) {
    const v = verifyFactEvidence(k.evidence, segmentTexts);
    accumulate(verification, v);
    if (!v.passed) continue;
    kpiReads.push({
      ...k,
      evidence: v.keptEvidence,
      fromOverlap: isFromOverlap(v.keptEvidence, contentFromIdx, contentToIdx),
    });
  }

  const gaps: VerifiedGap[] = [];
  for (const g of result.data.gaps) {
    const v = verifyFactEvidence(g.evidence, segmentTexts);
    accumulate(verification, v);
    if (!v.passed) continue;
    gaps.push({
      ...g,
      evidence: v.keptEvidence,
      // Keyed on the gap itself, not on who raised it: the same shortfall named
      // by four coaches is one gap with four raisers, and keying on the raiser
      // would produce four.
      normalizedKey: normalizeKey(g.gap),
      fromOverlap: isFromOverlap(v.keptEvidence, contentFromIdx, contentToIdx),
    });
  }

  const discussions: VerifiedDiscussion[] = [];
  for (const d of result.data.discussions) {
    const v = verifyFactEvidence(d.evidence, segmentTexts);
    accumulate(verification, v);
    if (!v.passed) continue;
    discussions.push({
      ...d,
      evidence: v.keptEvidence,
      // Kind is part of the key so a customer-feedback item and a good-news
      // item that happen to share wording stay distinct.
      normalizedKey: `${d.kind}:${normalizeKey(d.summary)}`,
      fromOverlap: isFromOverlap(v.keptEvidence, contentFromIdx, contentToIdx),
    });
  }

  return {
    participants,
    stucks,
    wwwCandidates,
    segmentMarkers,
    kpiReads,
    gaps,
    discussions,
    speakersSeen: result.data.speakersSeen,
    topicsOpen: result.data.topicsOpen,
    truncated: result.data.truncated,
    verification,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsd: result.costUsd,
    },
    model: result.model,
    promptVersion: PROMPT_VERSION,
    repaired: result.repaired,
    traceId: result.traceId,
  };
}
