/**
 * Fact schemas — the contract between the model and the database.
 *
 * Everything the extractor produces is validated against these before it
 * reaches Postgres (doc 17 §F.3). Two design rules run through all of them:
 *
 * 1. THE MODEL CLASSIFIES; THE BACKEND SCORES.
 *    Adherence is an enum (`YES` / `PARTIAL` / `NO`), never a number. The
 *    requirement doc fixes the mapping at Yes=100 / Partial=50 / No=0 and
 *    averages it over the huddles a member ATTENDED — that arithmetic lives in
 *    `weeklyHuddleAggregate.ts`, where it is testable and cannot drift. Asking
 *    a model for a percentage would make every report's headline number an
 *    LLM guess.
 *
 * 2. ADHERENCE AND QUALITY ARE SEPARATE AXES.
 *    The client doc is explicit: adherence answers *"was the update given?"*,
 *    quality answers *"how good was it?"*. Collapsing them loses the exact
 *    distinction the Facilitator Observations section is built on — a member
 *    can score 100% adherence while every achievement is activity-oriented.
 *
 *    The doc also pins two classifications that look like edge cases but are
 *    load-bearing:
 *      · "BAU | No major Achievement : 100%"  → BAU is FULL adherence. The
 *        member answered. Quality is `BAU`, and that is what the observations
 *        section reports on.
 *      · "Laundry list : vague | 50%"         → an undifferentiated list of
 *        activities is PARTIAL adherence and `VAGUE` quality.
 *
 * Everything is `.strict()`: an unexpected key is a schema violation, not a
 * silently-ignored field. A model inventing `"score": 85` must fail loudly
 * rather than have it dropped and the omission never noticed.
 */

import { z } from "zod";

/**
 * Bump when the extracted SHAPE changes. Part of the extraction idempotency
 * key, so bumping it forces re-extraction — correct, because facts stored
 * under an older shape cannot be read by newer code.
 */
export const FACT_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * Evidence for one claim.
 *
 * `quote` must appear VERBATIM in the cited segments — `evidenceVerifier.ts`
 * checks that by substring match, and an unverifiable quote gets its fact
 * dropped. That check is the reason the normaliser never rewrites mid-sentence
 * text: over-cleaning would silently invalidate every quote.
 *
 * `transcriptSegmentIds` carries segment INDICES (`MeetingTranscriptSegment.idx`),
 * not row ids. The model can see indices in its prompt; it cannot know cuids.
 * Indices are dense, stable per transcript, and resolve by primary key.
 */
export const evidenceSchema = z
  .object({
    quote: z.string().min(3).max(600),
    transcriptSegmentIds: z.array(z.number().int().min(0)).min(1).max(20),
  })
  .strict();

export type EvidenceInput = z.infer<typeof evidenceSchema>;

/** At least one piece of evidence. A claim without evidence is not a fact. */
const evidenceList = z.array(evidenceSchema).min(1).max(6);

const confidence = z.number().min(0).max(1);

// ---------------------------------------------------------------------------
// Enums — closed sets, so the values stay queryable
// ---------------------------------------------------------------------------

/** Was the update given? Scored 100 / 50 / 0 by the backend, never here. */
export const ADHERENCE = ["YES", "PARTIAL", "NO"] as const;
export const adherenceSchema = z.enum(ADHERENCE);
export type Adherence = (typeof ADHERENCE)[number];

/**
 * How good was the Yesterday Achievement?
 *
 *   OUTCOME   — a result: "closed the Yonder monthly", "shipped the API integration"
 *   ACTIVITY  — effort without a result: "worked on testing", "was in meetings"
 *   BAU       — explicitly routine / no major achievement. FULL adherence.
 *   VAGUE     — a laundry list, or too broad to tell what was achieved
 *   NONE      — explicitly stated there was no achievement
 */
export const ACHIEVEMENT_QUALITY = [
  "OUTCOME",
  "ACTIVITY",
  "BAU",
  "VAGUE",
  "NONE",
] as const;
export const achievementQualitySchema = z.enum(ACHIEVEMENT_QUALITY);

/**
 * How good was the Today Focus?
 *
 *   DELIVERABLE    — a named outcome for today
 *   SPECIFIC       — concrete and actionable, if not a hard deliverable
 *   CARRY_FORWARD  — explicitly the same item as a previous day
 *   BAU            — "business as usual", "the usual"
 *   VAGUE          — "continue working on X", no clear priority
 *   NONE           — no focus given
 */
export const FOCUS_QUALITY = [
  "DELIVERABLE",
  "SPECIFIC",
  "CARRY_FORWARD",
  "BAU",
  "VAGUE",
  "NONE",
] as const;
export const focusQualitySchema = z.enum(FOCUS_QUALITY);

/**
 * How was the Stuck handled?
 *
 *   CLEAR          — a specific blocker, actionable
 *   UNCLEAR        — a blocker mentioned but too vague to act on
 *   EXPLICIT_NONE  — explicitly said "no stuck". This is FULL adherence: the
 *                    protocol asks members to state it either way. Frequency of
 *                    this is tracked separately because the client wants it
 *                    correlated with Red KPIs later — see `noStuck` below.
 *   NOT_ADDRESSED  — the member never mentioned stucks at all
 */
export const STUCK_QUALITY = [
  "CLEAR",
  "UNCLEAR",
  "EXPLICIT_NONE",
  "NOT_ADDRESSED",
] as const;
export const stuckQualitySchema = z.enum(STUCK_QUALITY);

// ---------------------------------------------------------------------------
// Daily Huddle facts
// ---------------------------------------------------------------------------

const dimension = <Q extends z.ZodTypeAny>(quality: Q) =>
  z
    .object({
      /** Verbatim-ish summary of what was said. Not a judgement. */
      text: z.string().max(1200).nullable(),
      adherence: adherenceSchema,
      quality,
      evidence: evidenceList,
    })
    .strict();

/**
 * One participant's three-point update in one huddle.
 *
 * The highest-value fact in the system. Self-joined on
 * `(clientMemberId, meetingDate)` it also answers Phase-2 commitment
 * follow-through — today's Yesterday-Achievement against yesterday's
 * Today-Focus — with **no schema change**, which the requirement doc asks for
 * explicitly.
 */
export const participantFactSchema = z
  .object({
    /** Speaker label exactly as the transcript has it. Resolved separately. */
    speakerRaw: z.string().min(1).max(200),
    achievement: dimension(achievementQualitySchema),
    focus: dimension(focusQualitySchema),
    stuck: dimension(stuckQualitySchema),
    /**
     * Did the member explicitly say they had no stuck?
     *
     * Stored even though it is derivable from `stuck.quality`, because the
     * client doc asks for "No Stuck" frequency as structured underlying data
     * even when it is not displayed — it is the input to the future
     * No-Stuck ↔ Red-KPI correlation, and a boolean column is far cheaper to
     * aggregate than an enum comparison across four weeks.
     */
    noStuck: z.boolean(),
    confidence,
  })
  .strict();

export type ParticipantFactInput = z.infer<typeof participantFactSchema>;

/**
 * One blocker raised in a huddle.
 *
 * `raisedForRaw` is free text on purpose: a stuck is often raised for a client
 * ("Ador Client"), a team, or an external party — not only for a roster member.
 * Forcing it to a member id would either lose those or invent an owner.
 */
export const stuckFactSchema = z
  .object({
    raisedByRaw: z.string().min(1).max(200),
    raisedForRaw: z.string().max(200).nullable(),
    description: z.string().min(3).max(1000),
    /** Free-form, e.g. "Technical / Platform". Not an enum — the vocabulary is the client's. */
    category: z.string().max(120).nullable(),
    /**
     * Status ONLY if stated in the meeting. The model must not infer it: a
     * blocker's real status lives in the business record, not in a sentence.
     */
    statusStated: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).nullable(),
    evidence: evidenceList,
    confidence,
  })
  .strict();

export type StuckFactInput = z.infer<typeof stuckFactSchema>;

/**
 * How complete is a WWW candidate?
 *
 * The client doc is unambiguous: where Who / What / When is missing, FLAG it —
 * never infer. "Rahul will complete API integration" with no date must report
 * `When: Not specified`, not a guessed Friday.
 */
export const WWW_COMPLETENESS = [
  "COMPLETE",
  "MISSING_WHEN",
  "MISSING_WHO",
  "MISSING_WHAT",
  "MISSING_MULTIPLE",
] as const;
export const wwwCompletenessSchema = z.enum(WWW_COMPLETENESS);

export const wwwFactSchema = z
  .object({
    whoRaw: z.string().max(200).nullable(),
    what: z.string().min(3).max(1000),
    /** The date AS SPOKEN — "this week", "by Friday", "month-end". Never normalised here. */
    whenText: z.string().max(200).nullable(),
    /**
     * Required boolean, not an optional field.
     *
     * The model must positively ASSERT that no date was given rather than
     * simply omitting `whenText`. An omission is ambiguous — it could mean
     * "absent" or "I forgot" — and that ambiguity is exactly where a guessed
     * due date would creep in.
     */
    whenMissing: z.boolean(),
    completeness: wwwCompletenessSchema,
    evidence: evidenceList,
    confidence,
  })
  .strict();

export type WwwFactInput = z.infer<typeof wwwFactSchema>;

// ---------------------------------------------------------------------------
// Weekly Meeting facts
// ---------------------------------------------------------------------------

export const SEGMENT_KEYS_ENUM = [
  "goodNews",
  "kpDashboard",
  "gaps",
  "www",
  "feedback",
  "collectiveIntelligence",
  "opspReview",
  "onePhraseClose",
] as const;

/**
 * A boundary where the meeting moved into or out of an agenda segment.
 *
 * The model reports only WHERE the boundary fell. Coverage and time discipline
 * are computed from these by `segmentAdherence.ts` — asking a model whether a
 * segment "over-ran" would be asking it to do arithmetic against an expected
 * duration it was never given.
 */
export const segmentMarkerSchema = z
  .object({
    segmentKey: z.enum(SEGMENT_KEYS_ENUM),
    boundary: z.enum(["START", "END"]),
    /** Index of the turn where the transition happened. */
    atSegmentId: z.number().int().min(0),
    /** True when the segment was started but visibly not completed. */
    partial: z.boolean(),
    evidence: evidenceList,
    confidence,
  })
  .strict();

export type SegmentMarkerInput = z.infer<typeof segmentMarkerSchema>;

/** RAG as STATED. `NOT_STATED` is a real answer and the safe default. */
export const RAG_VALUES = ["GREEN", "AMBER", "RED", "MIXED", "NOT_STATED"] as const;
export const ragSchema = z.enum(RAG_VALUES);

/**
 * One member's K&P dashboard read.
 *
 * The requirement doc is explicit that a stated RAG must be preserved and never
 * re-judged. So the model reports what was said, and `NOT_STATED` exists so it
 * has an honest option other than guessing a colour.
 */
export const kpiFactSchema = z
  .object({
    speakerRaw: z.string().min(1).max(200),
    kpiRag: ragSchema,
    priorityRag: ragSchema,
    keyPoints: z.array(z.string().max(500)).max(12),
    evidence: evidenceList,
    confidence,
  })
  .strict();

export type KpiFactInput = z.infer<typeof kpiFactSchema>;

export const gapFactSchema = z
  .object({
    gap: z.string().min(3).max(1000),
    /** Only when an action was actually agreed. Never inferred. */
    agreedAction: z.string().max(1000).nullable(),
    ownerRaw: z.string().max(200).nullable(),
    /** TEAM when several members raised the same thing. */
    scope: z.enum(["TEAM", "INDIVIDUAL"]),
    raisedByRaw: z.array(z.string().max(200)).max(20),
    /** Only when a severity was stated aloud. */
    severityStated: z.enum(["RED", "AMBER", "GREEN"]).nullable(),
    evidence: evidenceList,
    confidence,
  })
  .strict();

export type GapFactInput = z.infer<typeof gapFactSchema>;

export const DISCUSSION_KINDS = [
  "GOOD_NEWS",
  "CEF_CUSTOMER",
  "CEF_EMPLOYEE",
  "CI_TOPIC",
] as const;

export const discussionFactSchema = z
  .object({
    kind: z.enum(DISCUSSION_KINDS),
    sharedByRaw: z.string().max(200).nullable(),
    summary: z.string().min(3).max(1500),
    outcome: z.string().max(1000).nullable(),
    /**
     * True when the segment was explicitly skipped or deferred.
     *
     * Load-bearing for CI: the requirement doc says a skipped CI must be
     * RECORDED as skipped, not replaced with a topic scraped from elsewhere in
     * the conversation. A deferred CI is a row saying so.
     */
    wasDeferred: z.boolean(),
    evidence: evidenceList,
    confidence,
  })
  .strict();

export type DiscussionFactInput = z.infer<typeof discussionFactSchema>;

// ---------------------------------------------------------------------------
// Chunk envelope
// ---------------------------------------------------------------------------

/**
 * What one chunk-extraction call returns.
 *
 * `speakersSeen` and `topicsOpen` are cheap context for consolidation: a topic
 * still open at a chunk's end is a hint that the next chunk continues it, which
 * helps the merger union rather than duplicate.
 */
export const chunkExtractionSchema = z
  .object({
    participants: z.array(participantFactSchema).max(60),
    stucks: z.array(stuckFactSchema).max(40),
    wwwCandidates: z.array(wwwFactSchema).max(40),
    /**
     * Weekly Meeting facts. Optional with empty defaults so a Daily Huddle
     * chunk — which has none of these — stays schema-valid without the model
     * being asked to return four empty arrays it has no use for.
     */
    segmentMarkers: z.array(segmentMarkerSchema).max(40).default([]),
    kpiReads: z.array(kpiFactSchema).max(40).default([]),
    gaps: z.array(gapFactSchema).max(40).default([]),
    discussions: z.array(discussionFactSchema).max(40).default([]),
    speakersSeen: z.array(z.string().max(200)).max(60),
    topicsOpen: z.array(z.string().max(200)).max(20),
    /** True when the chunk was cut mid-discussion and detail may be missing. */
    truncated: z.boolean(),
  })
  .strict();

export type ChunkExtraction = z.infer<typeof chunkExtractionSchema>;

/**
 * JSON Schema handed to Gemini as `responseSchema`.
 *
 * Kept hand-written rather than generated from the Zod schema: the provider
 * accepts a restricted JSON-Schema dialect (no `$ref`, no `oneOf`, limited
 * keywords), and generated output routinely trips those limits. Zod remains the
 * authority — this only steers generation, and anything that slips through is
 * still rejected by `chunkExtractionSchema`.
 */
export const chunkExtractionResponseSchema: Record<string, unknown> = {
  type: "object",
  required: ["participants", "stucks", "wwwCandidates", "speakersSeen", "topicsOpen", "truncated"],
  properties: {
    participants: {
      type: "array",
      items: {
        type: "object",
        required: ["speakerRaw", "achievement", "focus", "stuck", "noStuck", "confidence"],
        properties: {
          speakerRaw: { type: "string" },
          achievement: dimensionJson([...ACHIEVEMENT_QUALITY]),
          focus: dimensionJson([...FOCUS_QUALITY]),
          stuck: dimensionJson([...STUCK_QUALITY]),
          noStuck: { type: "boolean" },
          confidence: { type: "number" },
        },
      },
    },
    stucks: {
      type: "array",
      items: {
        type: "object",
        required: ["raisedByRaw", "description", "evidence", "confidence"],
        properties: {
          raisedByRaw: { type: "string" },
          raisedForRaw: { type: "string", nullable: true },
          description: { type: "string" },
          category: { type: "string", nullable: true },
          statusStated: {
            type: "string",
            nullable: true,
            enum: ["OPEN", "IN_PROGRESS", "RESOLVED"],
          },
          evidence: evidenceJson(),
          confidence: { type: "number" },
        },
      },
    },
    wwwCandidates: {
      type: "array",
      items: {
        type: "object",
        required: ["what", "whenMissing", "completeness", "evidence", "confidence"],
        properties: {
          whoRaw: { type: "string", nullable: true },
          what: { type: "string" },
          whenText: { type: "string", nullable: true },
          whenMissing: { type: "boolean" },
          completeness: { type: "string", enum: [...WWW_COMPLETENESS] },
          evidence: evidenceJson(),
          confidence: { type: "number" },
        },
      },
    },
    segmentMarkers: {
      type: "array",
      items: {
        type: "object",
        required: ["segmentKey", "boundary", "atSegmentId", "partial", "evidence", "confidence"],
        properties: {
          segmentKey: { type: "string", enum: [...SEGMENT_KEYS_ENUM] },
          boundary: { type: "string", enum: ["START", "END"] },
          atSegmentId: { type: "integer" },
          partial: { type: "boolean" },
          evidence: evidenceJson(),
          confidence: { type: "number" },
        },
      },
    },
    kpiReads: {
      type: "array",
      items: {
        type: "object",
        required: ["speakerRaw", "kpiRag", "priorityRag", "keyPoints", "evidence", "confidence"],
        properties: {
          speakerRaw: { type: "string" },
          kpiRag: { type: "string", enum: [...RAG_VALUES] },
          priorityRag: { type: "string", enum: [...RAG_VALUES] },
          keyPoints: { type: "array", items: { type: "string" } },
          evidence: evidenceJson(),
          confidence: { type: "number" },
        },
      },
    },
    gaps: {
      type: "array",
      items: {
        type: "object",
        required: ["gap", "scope", "raisedByRaw", "evidence", "confidence"],
        properties: {
          gap: { type: "string" },
          agreedAction: { type: "string", nullable: true },
          ownerRaw: { type: "string", nullable: true },
          scope: { type: "string", enum: ["TEAM", "INDIVIDUAL"] },
          raisedByRaw: { type: "array", items: { type: "string" } },
          severityStated: {
            type: "string",
            nullable: true,
            enum: ["RED", "AMBER", "GREEN"],
          },
          evidence: evidenceJson(),
          confidence: { type: "number" },
        },
      },
    },
    discussions: {
      type: "array",
      items: {
        type: "object",
        required: ["kind", "summary", "wasDeferred", "evidence", "confidence"],
        properties: {
          kind: { type: "string", enum: [...DISCUSSION_KINDS] },
          sharedByRaw: { type: "string", nullable: true },
          summary: { type: "string" },
          outcome: { type: "string", nullable: true },
          wasDeferred: { type: "boolean" },
          evidence: evidenceJson(),
          confidence: { type: "number" },
        },
      },
    },
    speakersSeen: { type: "array", items: { type: "string" } },
    topicsOpen: { type: "array", items: { type: "string" } },
    truncated: { type: "boolean" },
  },
};

function evidenceJson(): Record<string, unknown> {
  return {
    type: "array",
    items: {
      type: "object",
      required: ["quote", "transcriptSegmentIds"],
      properties: {
        quote: { type: "string" },
        transcriptSegmentIds: { type: "array", items: { type: "integer" } },
      },
    },
  };
}

function dimensionJson(quality: string[]): Record<string, unknown> {
  return {
    type: "object",
    required: ["adherence", "quality", "evidence"],
    properties: {
      text: { type: "string", nullable: true },
      adherence: { type: "string", enum: [...ADHERENCE] },
      quality: { type: "string", enum: quality },
      evidence: evidenceJson(),
    },
  };
}

// ---------------------------------------------------------------------------
// Deterministic scoring — the numbers the model is not allowed to produce
// ---------------------------------------------------------------------------

/**
 * Yes = 100, Partial = 50, No = 0.
 *
 * Fixed by the requirement doc. It lives here, next to the enum it scores, so
 * the mapping is impossible to misplace — and so no prompt ever has to mention
 * a number.
 */
export function scoreAdherence(a: Adherence): number {
  switch (a) {
    case "YES":
      return 100;
    case "PARTIAL":
      return 50;
    case "NO":
      return 0;
  }
}

/**
 * Adherence implied by a quality classification, for the two cases the client
 * doc pins explicitly.
 *
 * Used to CHECK the model, not to replace it: if the model says a BAU
 * achievement is `NO` adherence, that contradicts "BAU | No major Achievement :
 * 100%" and the disagreement is worth surfacing rather than silently trusting.
 * Returns null where quality does not determine adherence.
 */
export function adherenceImpliedByQuality(
  quality: string,
): Adherence | null {
  switch (quality) {
    // The member answered the question; the answer was "routine". Full marks
    // for adherence — the observation belongs in the quality commentary.
    case "BAU":
      return "YES";
    // A laundry list is an answer, but not a usable one.
    case "VAGUE":
      return "PARTIAL";
    // Explicitly stating "no stuck" is exactly what the protocol asks for.
    case "EXPLICIT_NONE":
      return "YES";
    case "NOT_ADDRESSED":
      return "NO";
    default:
      return null;
  }
}
