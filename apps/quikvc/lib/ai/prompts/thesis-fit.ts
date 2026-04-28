/**
 * Thesis-fit scoring for sourced opportunities.
 *
 * Given a sourced opportunity (startup name, pitch, optional sector hints) and
 * the fund's verticals + scoring criteria, ask Haiku to:
 *   - Suggest the best-matching vertical (if any)
 *   - Return a 0-100 thesis-fit score
 *   - Brief rationale (1-2 sentences)
 *
 * Returns a stub when ANTHROPIC_API_KEY is absent.
 */
import { callClaude, MODEL_HAIKU, parseJsonResponse } from "@/lib/ai/claude";

export interface ThesisFitInput {
  startupName: string;
  pitch: string;
  website?: string | null;
  verticals: { id: string; name: string; description: string | null }[];
}

export interface ThesisFitResult {
  verticalId: string | null;
  score: number; // 0-100
  reason: string;
  isStub: boolean;
}

const SYSTEM = `You are an investment analyst at a venture fund. You evaluate sourced startups
for thesis fit against the fund's investment verticals. Be terse and decisive.`;

export async function scoreThesisFit(input: ThesisFitInput): Promise<ThesisFitResult> {
  const verticalCatalog = input.verticals
    .map((v) => `  - id="${v.id}" name="${v.name}"${v.description ? ` desc="${v.description}"` : ""}`)
    .join("\n");

  const prompt = `Fund verticals:
${verticalCatalog || "  (none configured)"}

Sourced startup:
  Name: ${input.startupName}
  Pitch: ${input.pitch || "(no pitch provided)"}
  Website: ${input.website ?? "n/a"}

Return ONLY valid JSON in this exact shape:
{
  "verticalId": "<id of best-matching vertical or null>",
  "score": <integer 0-100>,
  "reason": "<one or two sentences explaining the fit>"
}`;

  const r = await callClaude({
    system: SYSTEM,
    prompt,
    model: MODEL_HAIKU,
    maxTokens: 400,
    context: "thesis-fit",
  });

  if (r.isStub) {
    // Deterministic stub: pick first vertical, score=50
    return {
      verticalId: input.verticals[0]?.id ?? null,
      score: 50,
      reason: "AI stub — set ANTHROPIC_API_KEY for real thesis-fit scoring.",
      isStub: true,
    };
  }

  try {
    const parsed = parseJsonResponse<{ verticalId: string | null; score: number; reason: string }>(r.text);
    const score = Math.max(0, Math.min(100, Math.round(parsed.score)));
    return {
      verticalId: parsed.verticalId,
      score,
      reason: parsed.reason ?? "",
      isStub: false,
    };
  } catch {
    return {
      verticalId: null,
      score: 0,
      reason: "Failed to parse AI response.",
      isStub: false,
    };
  }
}
