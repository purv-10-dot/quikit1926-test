/**
 * Intelligent transcript chunking — stage 2 of the long-transcript pipeline.
 *
 * Stage 3 of doc 17 §D.3. Deterministic and pure: same segments in, same chunk
 * plan out, every time. That determinism is load-bearing — the chunk plan feeds
 * `extractionIdempotencyKey`, so a wobble here would silently force
 * re-extraction of every meeting.
 *
 * WHY CHUNK AT ALL
 * ----------------
 * A 4-hour Weekly Meeting is ~60k tokens; 6 hours is ~90k. Gemini's context
 * window would hold that, so the reason for chunking is NOT input size. It is:
 *
 *   · OUTPUT tokens. One call would have to emit ~19 K&P rows, ~8 segment
 *     timings, ~15 gaps, ~20 WWW candidates, each with evidence quotes and
 *     segment ids — 15k–25k output tokens, past any sane `maxOutputTokens`,
 *     and quality degrades long before it truncates.
 *   · RETRY GRANULARITY. A failure at output token 9,000 discards the whole
 *     meeting and the whole spend. With chunks, one failed chunk costs ~7%.
 *   · EVIDENCE PRECISION. Timestamp and speaker attribution decay across a
 *     120k-token context, and evidence precision is the entire accuracy story.
 *   · WALL CLOCK. Vercel's ceiling is 300s; a single long-output call blows it.
 *
 * NOT FIXED-SIZE SPLITTING
 * ------------------------
 * Cutting every N characters would routinely split a WWW commitment in half —
 * "Rahul, can you take the API integration..." in one chunk and "...yes, by
 * Friday" in the next — and the `when` would be lost. That is a CORRECTNESS
 * failure, not an aesthetic one. So boundaries are scored (§D.3) and placed at
 * natural discussion breaks, with a small, deliberate overlap where the break
 * is not clean (§D.4).
 *
 * A short Daily Huddle yields exactly ONE chunk. There is no separate DH path —
 * `chunkCount` simply varies. Every resumability, coverage and idempotency
 * behaviour is therefore exercised daily by huddles, long before a 6-hour
 * meeting arrives.
 */

import type { NormalizedSegment } from "./normalize";

/**
 * Bump when boundary placement changes in a way that alters the chunk plan.
 * Part of the extraction idempotency key, so bumping it forces re-extraction.
 */
export const CHUNKER_VERSION = 1;

// ---------------------------------------------------------------------------
// Tunables — all env-overridable; the count is always DERIVED, never fixed
// ---------------------------------------------------------------------------

/**
 * Target content tokens per chunk.
 *
 * 4,000 balances prompt overhead against retry granularity (doc 17 §D.3):
 *
 *   tokens/chunk | chunks @4h | overhead | retry cost per failure
 *   2,500        | 24         | 48%      | 4%
 *   4,000        | 15         | 30%      | 7%   ← default
 *   6,000        | 10         | 20%      | 10%
 *
 * Overhead is the ~1,200-token static prompt prefix repeated per chunk. If
 * provider prefix-caching is confirmed (doc 17 open question Q6b) that overhead
 * largely disappears and this should drop to 2,500 for finer retry granularity.
 */
export const DEFAULT_SOFT_TARGET_TOKENS = 4_000;

/** Hard ceiling. A boundary is forced here even with no good candidate. */
export const DEFAULT_HARD_MAX_TOKENS = 6_000;

/** How far past the soft target to look for a better boundary. */
export const DEFAULT_LOOKAHEAD_TOKENS = 1_200;

/** Overlap applied at an unclean boundary. ~90s of speech. */
export const DEFAULT_OVERLAP_MS = 90_000;

/** A pause at least this long is a genuine discussion break. */
const CLEAN_BREAK_GAP_MS = 5_000;

export interface ChunkerOptions {
  softTargetTokens?: number;
  hardMaxTokens?: number;
  lookaheadTokens?: number;
  overlapMs?: number;
  /**
   * Agenda cue phrases, per client. A cue is the strongest boundary signal
   * available because it marks a real agenda transition rather than a pause.
   * Supplied from `Client.weeklyAgendaConfig`; the defaults below are a
   * starting point to tune against a real transcript (doc 17 open question Q11).
   */
  agendaCues?: string[];
  /** Speaker who chairs the meeting; handing back to them signals a break. */
  chairSpeaker?: string | null;
}

export function optionsFromEnv(): Required<Omit<ChunkerOptions, "agendaCues" | "chairSpeaker">> {
  const num = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    softTargetTokens: num(process.env.CHUNK_SOFT_TARGET_TOKENS, DEFAULT_SOFT_TARGET_TOKENS),
    hardMaxTokens: num(process.env.CHUNK_HARD_MAX_TOKENS, DEFAULT_HARD_MAX_TOKENS),
    lookaheadTokens: num(process.env.CHUNK_LOOKAHEAD_TOKENS, DEFAULT_LOOKAHEAD_TOKENS),
    overlapMs: num(process.env.CHUNK_OVERLAP_MS, DEFAULT_OVERLAP_MS),
  };
}

/** Default agenda cues — Scaling Up weekly-meeting phrasing plus generic handoffs. */
export const DEFAULT_AGENDA_CUES = [
  "good news",
  "let's move to",
  "lets move to",
  "moving on to",
  "next up",
  "over to you",
  "next segment",
  "any www",
  "who what when",
  "action items",
  "k&p",
  "kp dashboard",
  "dashboard review",
  "gaps",
  "collective intelligence",
  "opsp",
  "customer feedback",
  "employee feedback",
  "one phrase",
  "one-phrase",
  "let's start",
  "shall we begin",
  "wrap up",
];

// ---------------------------------------------------------------------------
// Boundary scoring
// ---------------------------------------------------------------------------

/**
 * Weights for boundary quality. Tuned so that a genuine agenda transition
 * outranks a mere pause, and so that a mid-sentence cut is effectively vetoed:
 * splitting a sentence is what loses a WWW's due date.
 */
export const BOUNDARY_WEIGHTS = {
  silenceGap: 40,
  agendaCue: 30,
  chairReturn: 25,
  speakerChange: 15,
  roundRobinRestart: 10,
  midSentence: -60,
} as const;

export interface BoundaryScore {
  score: number;
  reasons: string[];
}

const endsSentence = (text: string): boolean => /[.!?…]["')\]]?\s*$/.test(text.trim());

function containsCue(text: string, cues: string[]): boolean {
  const lower = text.toLowerCase();
  return cues.some((c) => lower.includes(c));
}

/**
 * Score a boundary placed BETWEEN `prev` and `next`.
 *
 * `seenSpeakers` carries the speakers already encountered in the current chunk,
 * so a speaker re-entering after others have spoken can be recognised as a
 * round-robin restart — the shape a K&P dashboard round actually has.
 */
export function scoreBoundary(
  prev: NormalizedSegment,
  next: NormalizedSegment,
  opts: { agendaCues: string[]; chairSpeaker?: string | null; seenSpeakers: Set<string> },
): BoundaryScore {
  let score = 0;
  const reasons: string[] = [];

  const gap = next.startMs - prev.endMs;
  if (gap >= CLEAN_BREAK_GAP_MS) {
    score += BOUNDARY_WEIGHTS.silenceGap;
    reasons.push(`silence:${Math.round(gap / 1000)}s`);
  }

  if (containsCue(next.text, opts.agendaCues)) {
    score += BOUNDARY_WEIGHTS.agendaCue;
    reasons.push("agendaCue");
  }

  const speakerChanged = prev.speakerRaw !== next.speakerRaw;
  if (speakerChanged) {
    if (
      opts.chairSpeaker &&
      next.speakerRaw &&
      next.speakerRaw === opts.chairSpeaker
    ) {
      score += BOUNDARY_WEIGHTS.chairReturn;
      reasons.push("chairReturn");
    } else {
      score += BOUNDARY_WEIGHTS.speakerChange;
      reasons.push("speakerChange");
    }

    if (next.speakerRaw && opts.seenSpeakers.has(next.speakerRaw)) {
      score += BOUNDARY_WEIGHTS.roundRobinRestart;
      reasons.push("roundRobin");
    }
  }

  if (!endsSentence(prev.text)) {
    score += BOUNDARY_WEIGHTS.midSentence;
    reasons.push("midSentence");
  }

  return { score, reasons };
}

/**
 * Is this boundary a clean topic break? Used to decide whether overlap is
 * needed (doc 17 §D.4): at a genuine break, context does not carry across, so
 * overlap would be pure cost.
 */
export function isCleanBreak(
  prev: NormalizedSegment,
  next: NormalizedSegment,
  agendaCues: string[],
): boolean {
  return (
    next.startMs - prev.endMs >= CLEAN_BREAK_GAP_MS &&
    prev.speakerRaw !== next.speakerRaw &&
    containsCue(next.text, agendaCues)
  );
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface PlannedChunk {
  idx: number;
  /** Inclusive segment index range of this chunk's OWN content. */
  segFromIdx: number;
  segToIdx: number;
  /**
   * Where the prompt actually starts once overlap is applied.
   * `<= segFromIdx`; equal when no overlap was needed.
   */
  overlapFromIdx: number | null;
  startMs: number;
  endMs: number;
  /** Tokens of this chunk's own content (excludes overlap). */
  estTokens: number;
  /** Tokens actually sent, including any overlap. */
  estPromptTokens: number;
  /** Score of the boundary that CLOSED this chunk; null for the last one. */
  boundaryScore: number | null;
  boundaryReasons: string[];
  /** Best-guess agenda segment, from a cue matched at the chunk's start. */
  agendaHint: string | null;
  /** True when one segment alone exceeded the hard maximum. */
  oversizeSegment: boolean;
}

export interface ChunkPlan {
  chunks: PlannedChunk[];
  /** Sum of each chunk's own content tokens — equals the transcript total. */
  contentTokens: number;
  /** Sum of what will actually be sent, including overlap. */
  promptTokens: number;
  /** Overlap cost as a percentage of content tokens. */
  overlapOverheadPct: number;
  /** Total content span in ms; the denominator of time-weighted coverage. */
  contentMs: number;
  chunkerVersion: number;
  options: Required<Omit<ChunkerOptions, "agendaCues" | "chairSpeaker">> & {
    agendaCues: string[];
    chairSpeaker: string | null;
  };
}

/**
 * Build the chunk plan for a normalised transcript.
 *
 * The chunk COUNT is always derived from the token estimate — never fixed — so
 * a 6- or 8-hour meeting is simply a larger `chunks.length` and needs no code
 * change (doc 17 §D.12).
 */
export function planChunks(
  segments: NormalizedSegment[],
  options: ChunkerOptions = {},
): ChunkPlan {
  const env = optionsFromEnv();
  const softTarget = options.softTargetTokens ?? env.softTargetTokens;
  const hardMax = Math.max(softTarget, options.hardMaxTokens ?? env.hardMaxTokens);
  const lookahead = options.lookaheadTokens ?? env.lookaheadTokens;
  const overlapMs = options.overlapMs ?? env.overlapMs;
  const agendaCues = (options.agendaCues ?? DEFAULT_AGENDA_CUES).map((c) =>
    c.toLowerCase(),
  );
  const chairSpeaker = options.chairSpeaker ?? null;

  const resolved = {
    softTargetTokens: softTarget,
    hardMaxTokens: hardMax,
    lookaheadTokens: lookahead,
    overlapMs,
    agendaCues,
    chairSpeaker,
  };

  if (segments.length === 0) {
    return {
      chunks: [],
      contentTokens: 0,
      promptTokens: 0,
      overlapOverheadPct: 0,
      contentMs: 0,
      chunkerVersion: CHUNKER_VERSION,
      options: resolved,
    };
  }

  const ranges: { from: number; to: number; score: number | null; reasons: string[] }[] = [];

  let from = 0;
  let tokens = 0;
  let seenSpeakers = new Set<string>();

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Close the open chunk BEFORE a segment that would push it past the hard
    // maximum. Without this, an oversized turn arriving mid-chunk drags its
    // predecessors over the ceiling with it — and the oversize guard below,
    // which only fires when such a turn STARTS a chunk, never gets the chance.
    if (tokens > 0 && tokens + seg.estTokens > hardMax) {
      ranges.push({ from, to: i - 1, score: 0, reasons: ["hardMax"] });
      from = i;
      tokens = 0;
      seenSpeakers = new Set<string>();
    }

    tokens += seg.estTokens;
    if (seg.speakerRaw) seenSpeakers.add(seg.speakerRaw);

    const isLast = i === segments.length - 1;

    // A single segment larger than the hard max is its own chunk. It is never
    // split: splitting mid-turn would break evidence attribution, and the
    // segment is the smallest unit that carries a speaker and a timestamp.
    if (from === i && seg.estTokens >= hardMax) {
      ranges.push({ from, to: i, score: null, reasons: ["oversizeSegment"] });
      from = i + 1;
      tokens = 0;
      seenSpeakers = new Set<string>();
      continue;
    }

    if (isLast) {
      ranges.push({ from, to: i, score: null, reasons: [] });
      break;
    }

    if (tokens < softTarget) continue;

    // At or past the soft target: look ahead for the best boundary.
    let best: { at: number; score: number; reasons: string[] } | null = null;
    let scanTokens = 0;

    for (let j = i; j < segments.length - 1; j++) {
      if (j > i) {
        scanTokens += segments[j].estTokens;
        if (scanTokens > lookahead) break;
        if (tokens + scanTokens > hardMax) break;
      }
      const { score, reasons } = scoreBoundary(segments[j], segments[j + 1], {
        agendaCues,
        chairSpeaker,
        seenSpeakers,
      });
      if (!best || score > best.score) best = { at: j, score, reasons };
    }

    // No positive candidate in range: cut at the hard maximum instead of
    // letting the chunk grow without bound.
    const cutAt = best && best.score > 0 ? best.at : i;
    const chosen = best && best.score > 0 ? best : { score: 0, reasons: ["hardMax"] };

    ranges.push({ from, to: cutAt, score: chosen.score, reasons: chosen.reasons });

    from = cutAt + 1;
    tokens = 0;
    seenSpeakers = new Set<string>();
    i = cutAt; // resume after the boundary
  }

  // ── Materialise, applying overlap where the boundary was not clean ────────
  const byIdx = new Map(segments.map((s) => [s.idx, s]));
  const chunks: PlannedChunk[] = ranges.map((r, n) => {
    const first = segments[r.from];
    const last = segments[r.to];

    let overlapFromIdx: number | null = null;
    if (n > 0) {
      const prevLast = segments[ranges[n - 1].to];
      if (!isCleanBreak(prevLast, first, agendaCues)) {
        // Walk back until the overlap window is covered. Aligned to segment
        // starts so a turn is never half-included.
        const target = first.startMs - overlapMs;
        let k = r.from - 1;
        while (k > 0 && segments[k - 1].startMs >= target) k -= 1;
        if (k < r.from) overlapFromIdx = segments[k].idx;
      }
    }

    const ownTokens = sumTokens(segments, r.from, r.to);
    const overlapTokens =
      overlapFromIdx === null
        ? 0
        : sumTokens(segments, indexOf(byIdx, overlapFromIdx), r.from - 1);

    return {
      idx: n,
      segFromIdx: first.idx,
      segToIdx: last.idx,
      overlapFromIdx,
      startMs: first.startMs,
      endMs: last.endMs,
      estTokens: ownTokens,
      estPromptTokens: ownTokens + overlapTokens,
      boundaryScore: r.score,
      boundaryReasons: r.reasons,
      agendaHint: detectAgendaHint(first.text, agendaCues),
      oversizeSegment: r.reasons.includes("oversizeSegment"),
    };
  });

  const contentTokens = chunks.reduce((n, c) => n + c.estTokens, 0);
  const promptTokens = chunks.reduce((n, c) => n + c.estPromptTokens, 0);

  return {
    chunks,
    contentTokens,
    promptTokens,
    overlapOverheadPct:
      contentTokens > 0
        ? Math.round(((promptTokens - contentTokens) / contentTokens) * 1000) / 10
        : 0,
    contentMs: Math.max(0, (segments.at(-1)?.endMs ?? 0) - segments[0].startMs),
    chunkerVersion: CHUNKER_VERSION,
    options: resolved,
  };
}

function sumTokens(segments: NormalizedSegment[], from: number, to: number): number {
  let n = 0;
  for (let i = Math.max(0, from); i <= Math.min(to, segments.length - 1); i++) {
    n += segments[i].estTokens;
  }
  return n;
}

function indexOf(byIdx: Map<number, NormalizedSegment>, idx: number): number {
  // Segment `idx` is dense and 0-based, so it doubles as the array position.
  return byIdx.has(idx) ? idx : 0;
}

function detectAgendaHint(text: string, cues: string[]): string | null {
  const lower = text.toLowerCase();
  for (const cue of cues) {
    if (lower.includes(cue)) return cue;
  }
  return null;
}

/**
 * Verify a plan covers every segment exactly once.
 *
 * Coverage is an invariant, not a preference: a gap means content silently
 * never reaches the model, and the report would then be built on a partial
 * transcript while claiming to be complete. Overlap is excluded by design —
 * it is re-read context, not additional coverage.
 */
export function verifyCoverage(
  plan: ChunkPlan,
  segments: NormalizedSegment[],
): { ok: boolean; missing: number[]; duplicated: number[] } {
  const seen = new Map<number, number>();
  for (const c of plan.chunks) {
    for (let i = c.segFromIdx; i <= c.segToIdx; i++) {
      seen.set(i, (seen.get(i) ?? 0) + 1);
    }
  }
  const missing: number[] = [];
  const duplicated: number[] = [];
  for (const s of segments) {
    const n = seen.get(s.idx) ?? 0;
    if (n === 0) missing.push(s.idx);
    else if (n > 1) duplicated.push(s.idx);
  }
  return { ok: missing.length === 0 && duplicated.length === 0, missing, duplicated };
}
