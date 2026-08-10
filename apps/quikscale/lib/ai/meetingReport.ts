/**
 * AI meeting-report generation for Fathom transcripts (Gemini).
 *
 * Given a saved `ClientMeetingTranscript`, ask Gemini to produce a structured
 * report modelled on the QuikScale Daily Huddle / Weekly Meeting report format,
 * plus candidate KPI / Priority / WWW items the transcript implies. Everything
 * here is provider-agnostic at the seam: it calls `generateContent` from the
 * shared Gemini key pool (round-robin + failover) exactly like the KPI/Priority
 * duplicate-check routes, and degrades via `GeminiUnavailableError`.
 *
 * `buildReportPrompt` and `parseReportResponse` are pure and exported for unit
 * testing — the DB-touching orchestration (duplicate tagging, persistence)
 * lives in the report API routes.
 */

import { z } from "zod";
import { generateContent } from "./geminiKeyPool";
import { QUIKSCALE_OVERVIEW } from "./quikscaleOverview";

export type ReportType = "DAILY" | "WEEKLY" | "GENERAL";

/** Raised when Gemini returns output we can't parse into a valid report. */
export class MeetingReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeetingReportError";
  }
}

// ---------------------------------------------------------------------------
// Report schema (what the model must return, and what we persist)
// ---------------------------------------------------------------------------

const ADHERENCE_RATING = z.enum(["YES", "PARTIAL", "NO"]);
const RAG = z.enum(["GREEN", "AMBER", "RED"]);

const sectionSchema = z.object({
  heading: z.string(),
  body: z.string(),
  /** Italic facilitator-style assessment shown under the section. */
  assessment: z.string().nullish(),
});

const adherenceRowSchema = z.object({
  participant: z.string(),
  role: z.string().nullish(),
  achievement: ADHERENCE_RATING.nullish(),
  focus: ADHERENCE_RATING.nullish(),
  stuck: ADHERENCE_RATING.nullish(),
  score: z.string().nullish(), // e.g. "3/3"
  rating: z.string().nullish(), // FULL / GOOD / PARTIAL / POOR
  /** Rationale text shown in the Individual Participant Breakdown, one per criterion. */
  achievementNote: z.string().nullish(),
  focusNote: z.string().nullish(),
  stuckNote: z.string().nullish(),
});

const meetingDetailsSchema = z.object({
  meetingType: z.string().nullish(),
  dateLabel: z.string().nullish(),
  startMark: z.string().nullish(),
  endMark: z.string().nullish(),
  durationLabel: z.string().nullish(),
  timeOfDay: z.string().nullish(),
});

const attendeeSchema = z.object({
  name: z.string(),
  role: z.string().nullish(),
});

/** `notPresent`/`comparisonNote` are computed server-side, not by the model. */
const attendanceSchema = z.object({
  present: z.array(attendeeSchema),
  notPresent: z.array(z.string()).nullish(),
  comparisonNote: z.string().nullish(),
});

const blockerSchema = z.object({
  raisedBy: z.string(),
  category: z.string(),
  description: z.string(),
  impact: z.string().nullish(),
  requiredAction: z.string().nullish(),
});

const scorecardRowSchema = z.object({
  metric: z.string(),
  reading: z.string(),
  rag: RAG.nullish(),
});

const kpiCandidateSchema = z.object({
  name: z.string(),
  description: z.string().nullish(),
  measurementUnit: z.enum(["Number", "Percentage", "Currency", "Ratio"]).nullish(),
  target: z.number().nullish(),
  confidence: z.number(),
  sourceQuote: z.string().nullish(),
});

const priorityCandidateSchema = z.object({
  name: z.string(),
  description: z.string().nullish(),
  owner: z.string().nullish(),
  confidence: z.number(),
  sourceQuote: z.string().nullish(),
});

const wwwCandidateSchema = z.object({
  who: z.string().nullish(),
  what: z.string(),
  when: z.string().nullish(), // ISO-ish date string; the modal normalizes
  confidence: z.number(),
  sourceQuote: z.string().nullish(),
});

export const meetingReportSchema = z.object({
  reportType: z.enum(["DAILY", "WEEKLY", "GENERAL"]),
  title: z.string(),
  overallConfidence: z.number(),
  meta: z
    .object({
      client: z.string().nullish(),
      date: z.string().nullish(),
      durationMinutes: z.number().nullish(),
      platform: z.string().nullish(),
      attendees: z.array(z.string()).nullish(),
    })
    .nullish(),
  summary: z.string().nullish(),
  sections: z.array(sectionSchema),
  adherence: z.array(adherenceRowSchema).nullish(),
  scorecard: z.array(scorecardRowSchema).nullish(),
  /** DAILY only — Meeting Details / Attendance / Stucks & Blockers sections. */
  meetingDetails: meetingDetailsSchema.nullish(),
  attendance: attendanceSchema.nullish(),
  blockers: z.array(blockerSchema).nullish(),
  extractedItems: z.object({
    kpis: z.array(kpiCandidateSchema),
    priorities: z.array(priorityCandidateSchema),
    wwws: z.array(wwwCandidateSchema),
  }),
});

export type MeetingReport = z.infer<typeof meetingReportSchema>;
export type KpiCandidateItem = z.infer<typeof kpiCandidateSchema>;
export type PriorityCandidateItem = z.infer<typeof priorityCandidateSchema>;
export type WwwCandidateItem = z.infer<typeof wwwCandidateSchema>;

// ---------------------------------------------------------------------------
// Stored report — the AI report plus per-item annotations the app adds
// (duplicate detection result, user's accept decision, created record id).
// This is what the generate route returns and the PUT route persists.
// ---------------------------------------------------------------------------

/** Reference to an existing QuikScale record an extracted item duplicates. */
export const duplicateRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerName: z.string().nullish(),
  /** 0..1 similarity from the semantic matcher; null for an exact-name match. */
  confidence: z.number().nullish(),
});
export type DuplicateRef = z.infer<typeof duplicateRefSchema>;

const annotations = {
  duplicate: duplicateRefSchema.nullish(),
  accepted: z.boolean().optional(),
  createdRecordId: z.string().nullish(),
};

export const storedMeetingReportSchema = meetingReportSchema.extend({
  extractedItems: z.object({
    kpis: z.array(kpiCandidateSchema.extend(annotations)),
    priorities: z.array(priorityCandidateSchema.extend(annotations)),
    wwws: z.array(wwwCandidateSchema.extend(annotations)),
  }),
});
export type StoredMeetingReport = z.infer<typeof storedMeetingReportSchema>;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/** The transcript fields the prompt needs — a subset of ClientMeetingTranscript. */
export interface ReportTranscriptInput {
  type: ReportType | null;
  title: string | null;
  clientName: string | null;
  meetingDate: string | null;
  durationMinutes: number | null;
  attendees: { name?: string | null; email?: string | null }[] | null;
  summary: string | null;
  actionItems: { text?: string | null }[] | null;
  rawText: string | null;
}

/** Cap the raw transcript sent to the model to bound token cost. */
export const RAW_TEXT_CAP = 60_000;

/** Build the report prompt. Pure — exported for unit testing. */
export function buildReportPrompt(t: ReportTranscriptInput): string {
  const type: ReportType = t.type ?? "GENERAL";
  const attendees = (t.attendees ?? [])
    .map((a) => a?.name || a?.email)
    .filter(Boolean)
    .join(", ");
  const rawText = (t.rawText ?? "").slice(0, RAW_TEXT_CAP);
  const truncated = (t.rawText ?? "").length > RAW_TEXT_CAP;

  const templateGuidance =
    type === "DAILY"
      ? [
          "This is a DAILY HUDDLE. Produce a structured adherence report:",
          "- `adherence`: one row per participant who actually spoke in the transcript, with achievement/focus/stuck each rated YES|PARTIAL|NO, a score like \"2/3\", a rating FULL|GOOD|PARTIAL|POOR, and — for the Individual Participant Breakdown — a short rationale in `achievementNote`/`focusNote`/`stuckNote` explaining WHY each was rated that way (e.g. \"Explicitly stated no blockers.\" or \"Vague — activity referenced but not framed as an achievement.\").",
          "- `meetingDetails`: only `meetingType` (e.g. \"Daily Huddle — Google Meet\", infer the platform from the transcript if mentioned, else omit it) and `timeOfDay` (e.g. \"Morning (inferred from greetings)\") — leave `dateLabel`/`durationLabel`/`startMark`/`endMark` null unless the transcript states an explicit recording timestamp, since the app fills in the real date/duration separately.",
          "- `attendance.present`: everyone who actually spoke, each with a short `role` inferred from what they discuss (e.g. \"Client Reporting\", \"Senior Coach\") — do not invent a `notPresent` list, the app computes that separately.",
          "- `blockers`: every stuck/blocker raised, each with `raisedBy`, a short `category` (e.g. \"Technical / Platform\", \"Finance / Collections\", \"Coordination\"), a `description`, an `impact`, and a `requiredAction`. Merge multiple mentions of the same underlying issue into one entry and note the overlap in its description.",
          "- `sections`: leave empty or include only a brief opening summary paragraph if useful — the structured fields above are the primary content. Leave `scorecard` null.",
        ]
      : type === "WEEKLY"
        ? [
            "This is a WEEKLY MEETING. Produce a segment report:",
            "- `sections`: one per covered segment (Good News Sharing, K&P Dashboard Review, GAPS & Action Plan, WWW, Customer/Employee Feedback, Collective Intelligence, OPSP Review), each with an `assessment`.",
            "- `scorecard`: rate the meeting on punctuality, end-time adherence, dashboard quality, WWW review, feedback, collective intelligence, OPSP, and attendance, each with a RAG value GREEN|AMBER|RED. Leave `adherence` null.",
          ]
        : [
            "The meeting cadence is unknown. Produce a general meeting summary in `sections`. Leave `adherence` and `scorecard` null.",
          ];

  return [
    QUIKSCALE_OVERVIEW,
    "",
    "You are a meeting-report analyst. Analyze the meeting transcript below and return a single JSON object.",
    ...templateGuidance,
    "",
    "In every case also extract candidate records the transcript implies, into `extractedItems`:",
    "- `kpis`: measurable metrics discussed (name, optional description/measurementUnit/target).",
    "- `priorities`: quarterly objectives/rocks an owner committed to (name, optional owner/description).",
    "- `wwws`: action items (who, what, optional when as an ISO date).",
    "Only extract items the transcript actually supports. For each item and for the report overall, include a `confidence` from 0 to 1 reflecting how clearly the transcript supports it. Add a short `sourceQuote` where possible.",
    "",
    "Return ONLY a JSON object with this exact shape (no markdown, no prose outside the JSON):",
    '{"reportType":"DAILY|WEEKLY|GENERAL","title":string,"overallConfidence":number,"meta":{"client":string|null,"date":string|null,"durationMinutes":number|null,"platform":string|null,"attendees":string[]},"summary":string,"sections":[{"heading":string,"body":string,"assessment":string|null}],"adherence":[{"participant":string,"role":string|null,"achievement":"YES|PARTIAL|NO","focus":"YES|PARTIAL|NO","stuck":"YES|PARTIAL|NO","score":string,"rating":string,"achievementNote":string|null,"focusNote":string|null,"stuckNote":string|null}]|null,"scorecard":[{"metric":string,"reading":string,"rag":"GREEN|AMBER|RED"}]|null,"meetingDetails":{"meetingType":string|null,"dateLabel":string|null,"startMark":string|null,"endMark":string|null,"durationLabel":string|null,"timeOfDay":string|null}|null,"attendance":{"present":[{"name":string,"role":string|null}]}|null,"blockers":[{"raisedBy":string,"category":string,"description":string,"impact":string|null,"requiredAction":string|null}]|null,"extractedItems":{"kpis":[{"name":string,"description":string|null,"measurementUnit":"Number|Percentage|Currency|Ratio"|null,"target":number|null,"confidence":number,"sourceQuote":string|null}],"priorities":[{"name":string,"description":string|null,"owner":string|null,"confidence":number,"sourceQuote":string|null}],"wwws":[{"who":string|null,"what":string,"when":string|null,"confidence":number,"sourceQuote":string|null}]}}',
    "",
    "MEETING METADATA:",
    `- Cadence: ${type}`,
    `- Title: ${t.title ?? "(none)"}`,
    `- Client: ${t.clientName ?? "(unknown)"}`,
    `- Date: ${t.meetingDate ?? "(unknown)"}`,
    `- Duration (min): ${t.durationMinutes ?? "(unknown)"}`,
    `- Attendees: ${attendees || "(unknown)"}`,
    t.summary ? `\nSOURCE SUMMARY:\n${t.summary}` : "",
    t.actionItems && t.actionItems.length
      ? `\nSOURCE ACTION ITEMS:\n${t.actionItems.map((a) => `- ${a?.text ?? ""}`).join("\n")}`
      : "",
    `\nTRANSCRIPT:\n${rawText || "(no transcript text)"}${truncated ? "\n…[truncated]" : ""}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/**
 * Parse Gemini's raw text into a validated `MeetingReport`. Tolerant of
 * code-fenced JSON. Clamps every confidence into [0,1]. Throws
 * `MeetingReportError` on unparseable / schema-invalid output (the route turns
 * that into a friendly error — distinct from `aiUnavailable`).
 *
 * Exported for unit testing.
 */
export function parseReportResponse(raw: string): MeetingReport {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new MeetingReportError("Model returned non-JSON output.");
  }

  const parsed = meetingReportSchema.safeParse(json);
  if (!parsed.success) {
    throw new MeetingReportError(
      `Report did not match the expected shape: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    );
  }

  const r = parsed.data;
  return {
    ...r,
    overallConfidence: clamp01(r.overallConfidence),
    extractedItems: {
      kpis: r.extractedItems.kpis.map((k) => ({ ...k, confidence: clamp01(k.confidence) })),
      priorities: r.extractedItems.priorities.map((p) => ({ ...p, confidence: clamp01(p.confidence) })),
      wwws: r.extractedItems.wwws.map((w) => ({ ...w, confidence: clamp01(w.confidence) })),
    },
  };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Generate a structured meeting report for a transcript.
 *
 * @throws {GeminiUnavailableError} when every Gemini key fails (route → `aiUnavailable`).
 * @throws {MeetingReportError} when the model output can't be parsed (route → friendly error).
 */
export async function generateMeetingReport(
  t: ReportTranscriptInput,
  opts: { signal?: AbortSignal } = {},
): Promise<MeetingReport> {
  const raw = await generateContent(buildReportPrompt(t), {
    responseMimeType: "application/json",
    signal: opts.signal,
  });
  return parseReportResponse(raw);
}
