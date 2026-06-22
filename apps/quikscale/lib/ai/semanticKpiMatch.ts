/**
 * Semantic name de-duplication via Gemini.
 *
 * Used by `POST /api/kpi/duplicate-check` and `POST /api/priority/duplicate-check`.
 * Given a candidate name and a short list of existing items (already
 * DB-pre-filtered to the same owner + quarter + year), ask Gemini which
 * existing item — if any — refers to the SAME thing, even when the wording
 * differs ("Monthly Sales Revenue" vs "Revenue per Month"). The model returns
 * a structured JSON verdict which we validate with Zod and guard against
 * hallucinated ids.
 *
 * Field equality (owner / unit / target / weeks / …) is decided by the caller
 * in plain code — this module only handles the fuzzy, meaning-based name match.
 * The `entityLabel` ("KPI", "Priority", …) only tunes the prompt wording.
 */

import { z } from "zod";
import { generateContent } from "./geminiKeyPool";

export interface KpiCandidate {
  id: string;
  name: string;
}

/** Shape Gemini is asked to return. */
const matchResultSchema = z.object({
  matchId: z.string().nullable(),
  confidence: z.number().min(0).max(1).optional(),
});

export type SemanticMatchResult = z.infer<typeof matchResultSchema>;

/** Build the instruction prompt. Exported for unit testing. */
export function buildPrompt(
  candidateName: string,
  existing: KpiCandidate[],
  entityLabel = "KPI",
): string {
  const list = existing
    .map((k, i) => `${i + 1}. id="${k.id}" name="${k.name}"`)
    .join("\n");

  return [
    `You are a de-duplication assistant for a performance-management app that tracks ${entityLabel}s.`,
    `Decide whether a NEW ${entityLabel} name refers to the SAME underlying item as any EXISTING ${entityLabel},`,
    "even when the wording differs — synonyms, reordered words, abbreviations, or pluralization",
    "all count as the same. Two names that merely share a topic but mean different things",
    "are NOT the same. If you are not confident, return null.",
    "",
    `NEW ${entityLabel} name: "${candidateName}"`,
    "",
    `EXISTING ${entityLabel}s:`,
    list,
    "",
    "Respond with ONLY a JSON object of the form:",
    `{"matchId": "<id of the matching existing ${entityLabel}, or null if none>", "confidence": <number 0..1>}`,
    "Do not include any prose, markdown, or text outside the JSON object.",
  ].join("\n");
}

/**
 * Parse Gemini's raw text into a validated result. Tolerant of code-fenced
 * JSON and rejects ids that aren't in the candidate set (hallucination guard).
 * Returns `{ matchId: null }` on any malformed output rather than throwing —
 * a bad parse must never block KPI creation.
 *
 * Exported for unit testing.
 */
export function parseMatchResponse(
  raw: string,
  existing: KpiCandidate[],
): SemanticMatchResult {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return { matchId: null };
  }

  const parsed = matchResultSchema.safeParse(json);
  if (!parsed.success) return { matchId: null };

  const { matchId } = parsed.data;
  // Only accept an id that actually exists in the candidate list.
  if (matchId && !existing.some((k) => k.id === matchId)) {
    return { matchId: null };
  }
  return parsed.data;
}

/**
 * Ask Gemini for the semantically-matching existing KPI. Returns
 * `{ matchId: null }` when there are no candidates or no semantic match.
 *
 * @throws {GeminiUnavailableError} (from the key pool) when every key fails —
 *   the caller turns that into `{ aiUnavailable: true }`.
 */
export async function findSemanticDuplicate(
  candidateName: string,
  existing: KpiCandidate[],
  entityLabel = "KPI",
): Promise<SemanticMatchResult> {
  if (existing.length === 0) return { matchId: null };

  const raw = await generateContent(buildPrompt(candidateName, existing, entityLabel), {
    responseMimeType: "application/json",
  });
  return parseMatchResponse(raw, existing);
}
