/**
 * Suggest comparable companies for a deal.
 *
 * Claude only — no external comp database. Returns 3-5 well-known companies
 * that share business model / sector / stage similarities with the input
 * company, plus a "why" rationale per comp. The analyst pins or removes.
 */
import { callClaude, parseJsonResponse, MODEL_SONNET } from "../claude";

export interface SuggestCompsInput {
  startupName: string;
  description: string;
  sector: string;
}

export interface SuggestedComp {
  name: string;
  sector: string | null;
  reason: string;
  link: string | null;
}

const SYSTEM_PROMPT = `You suggest comparable companies for VC analysts to benchmark against.

Conventions:
- Suggest 3-5 well-known public or recently-funded private companies.
- Prefer companies in the same sector + similar business model.
- Reasons should be short (1-2 sentences) and specific (avoid "similar industry").
- Do NOT invent companies. If you're unsure of a name, leave it out.
- Links should be canonical company sites only when known. Otherwise null.

Return STRICT JSON only. No markdown. Schema:
{
  "comps": [
    {
      "name": "<company name>",
      "sector": "<short sector tag or null>",
      "reason": "<why this is a relevant benchmark, 1-2 sentences>",
      "link": "<canonical URL or null>"
    }
  ]
}`;

export async function suggestComparables(
  input: SuggestCompsInput,
): Promise<{ comps: SuggestedComp[]; isStub: boolean }> {
  const r = await callClaude({
    system: SYSTEM_PROMPT,
    prompt: `STARTUP: ${input.startupName}
SECTOR: ${input.sector}
DESCRIPTION:
${input.description}

Suggest 3-5 comparable companies as JSON.`,
    model: MODEL_SONNET,
    maxTokens: 1000,
    context: `suggest-comps:${input.startupName}`,
  });

  if (r.isStub) {
    return {
      comps: [
        {
          name: "[AI stub — example comp]",
          sector: input.sector,
          reason: "Set ANTHROPIC_API_KEY to enable real suggestions.",
          link: null,
        },
      ],
      isStub: true,
    };
  }

  const parsed = parseJsonResponse<{ comps: SuggestedComp[] }>(r.text);
  return { comps: parsed.comps ?? [], isStub: false };
}
