/**
 * Score a deal against the tenant's scoring criteria.
 *
 * Input: structured deal data (application + financials + vertical) + criteria list.
 * Output: per-criterion score 0-100 + brief rationale + composite.
 *
 * Sprint 3a: called from POST /api/applications and from the Workbench
 * "Re-score with AI" button.
 */
import { callClaude, parseJsonResponse, MODEL_SONNET } from "../claude";

export interface ScoreCriterionInput {
  slug: string;
  name: string;
  description: string | null;
  weight: number;
}

export interface ScoreDealInput {
  startupName: string;
  description: string;
  sector: string;
  fundingAskInr: number; // in lakhs for prompt readability
  loanType: string;
  teamSize: number | null;
  foundedYear: number | null;
  monthlyRevenueLakhs: number | null;
  ebitdaLakhs: number | null;
  existingDebtLakhs: number | null;
  criteria: ScoreCriterionInput[];
}

export interface ScoreCriterionOutput {
  slug: string;
  score: number; // 0-100
  rationale: string;
}

export interface ScoreDealOutput {
  scores: ScoreCriterionOutput[];
  composite: number; // weighted 0-100
  /** Notes Claude wants surfaced to the analyst (caveats, missing data). */
  caveats: string[];
}

const SYSTEM_PROMPT = `You are a senior VC analyst evaluating an early-stage startup application.

You will be given:
1. A short description of the startup
2. Financial highlights (when provided)
3. A list of scoring criteria with weights

Your job: produce a numeric score 0-100 per criterion + a brief rationale.

Scoring guidance:
- 0-30: significant weakness or red flag
- 31-60: average / unproven
- 61-80: solid / strong evidence
- 81-100: exceptional / category-defining

Be calibrated — most early-stage applications cluster 40-70. Reserve 80+ for genuinely standout signals.

Return STRICT JSON only. No markdown, no preamble. Schema:
{
  "scores": [{ "slug": "<criterion slug>", "score": <int 0-100>, "rationale": "<one sentence>" }],
  "caveats": ["<any data gaps or assumptions>"]
}

Do NOT compute the composite — the server will weight + sum the per-criterion scores.`;

export async function scoreDeal(input: ScoreDealInput): Promise<ScoreDealOutput> {
  const fin = [
    input.monthlyRevenueLakhs != null && `Monthly revenue: ₹${input.monthlyRevenueLakhs}L`,
    input.ebitdaLakhs != null && `EBITDA: ₹${input.ebitdaLakhs}L`,
    input.existingDebtLakhs != null && `Existing debt: ₹${input.existingDebtLakhs}L`,
  ].filter(Boolean).join("\n") || "(financials not provided)";

  const criteriaList = input.criteria
    .map((c) => `- ${c.slug} (${c.weight}%): ${c.name}${c.description ? ` — ${c.description}` : ""}`)
    .join("\n");

  const userPrompt = `STARTUP: ${input.startupName}
SECTOR: ${input.sector}
FUNDING ASK: ₹${input.fundingAskInr}L (${input.loanType})
TEAM SIZE: ${input.teamSize ?? "unknown"}
FOUNDED: ${input.foundedYear ?? "unknown"}

DESCRIPTION:
${input.description}

FINANCIALS:
${fin}

CRITERIA:
${criteriaList}

Return JSON now.`;

  const r = await callClaude({
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    model: MODEL_SONNET,
    maxTokens: 1500,
    context: `score-deal:${input.startupName}`,
  });

  if (r.isStub) {
    // Stub: return mid-range placeholder scores so the UI renders
    return {
      scores: input.criteria.map((c) => ({
        slug: c.slug,
        score: 55,
        rationale: "AI stub — set ANTHROPIC_API_KEY to enable scoring.",
      })),
      composite: 55,
      caveats: ["AI not configured. Scores are placeholder values."],
    };
  }

  const parsed = parseJsonResponse<{
    scores: ScoreCriterionOutput[];
    caveats: string[];
  }>(r.text);

  // Compute composite weighted score
  const slugToWeight = Object.fromEntries(input.criteria.map((c) => [c.slug, c.weight]));
  const totalWeight = input.criteria.reduce((s, c) => s + c.weight, 0) || 100;
  const composite = Math.round(
    parsed.scores.reduce((sum, s) => {
      const weight = slugToWeight[s.slug] ?? 0;
      return sum + (s.score * weight) / totalWeight;
    }, 0),
  );

  return { scores: parsed.scores, composite, caveats: parsed.caveats ?? [] };
}
