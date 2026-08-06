import { OpenRouter } from "@openrouter/sdk";

export interface SkillWeight {
  skill: string;
  weight: number; // 1-10
}

export interface ATSScoreInput {
  jobTitle: string;
  jobDescription?: string | null;
  experienceMin?: number | null;
  experienceMax?: number | null;
  skillWeights: SkillWeight[];
  resumeText: string;
  candidateSummary?: string | null;
  candidateExperienceMonths?: number | null;
  candidateSkills?: string[];
}

interface ATSScoreBreakdownItem {
  skill: string;
  weight: number;
  matched: boolean;
  evidence: string;
  partialCredit: number; // 0..1
  contribution: number; // weight * partialCredit (0..weight)
}

export interface ATSScoreResult {
  overallScore: number; // 0-100
  verdict: "StrongMatch" | "GoodMatch" | "PartialMatch" | "WeakMatch" | "NoMatch";
  summary: string;
  experienceMatch: { fit: "Above" | "Within" | "Below" | "Unknown"; notes: string };
  breakdown: ATSScoreBreakdownItem[];
  strengths: string[];
  gaps: string[];
  model: string;
}

function normalizeResponse(raw: unknown, weights: SkillWeight[]): ATSScoreResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const breakdown: ATSScoreBreakdownItem[] = Array.isArray(r.breakdown)
    ? (r.breakdown as Array<Record<string, unknown>>).map((b) => {
        const skill = String(b.skill ?? "");
        const w = weights.find((sw) => sw.skill.toLowerCase() === skill.toLowerCase());
        const weight = Number(b.weight ?? w?.weight ?? 0);
        const partial = Math.max(0, Math.min(1, Number(b.partialCredit ?? (b.matched ? 1 : 0))));
        return {
          skill,
          weight,
          matched: Boolean(b.matched),
          evidence: String(b.evidence ?? ""),
          partialCredit: partial,
          contribution: Math.round(weight * partial * 10) / 10,
        };
      })
    : [];

  const totalWeight = weights.reduce((s, w) => s + w.weight, 0) || 1;
  const earned = breakdown.reduce((s, b) => s + b.weight * b.partialCredit, 0);
  const scoreFromBreakdown = Math.round((earned / totalWeight) * 100);

  const overall = typeof r.overallScore === "number"
    ? Math.max(0, Math.min(100, Math.round(r.overallScore)))
    : scoreFromBreakdown;

  const verdict = typeof r.verdict === "string" && ["StrongMatch", "GoodMatch", "PartialMatch", "WeakMatch", "NoMatch"].includes(r.verdict)
    ? (r.verdict as ATSScoreResult["verdict"])
    : overall >= 85 ? "StrongMatch"
    : overall >= 70 ? "GoodMatch"
    : overall >= 50 ? "PartialMatch"
    : overall >= 25 ? "WeakMatch"
    : "NoMatch";

  const expRaw = (r.experienceMatch ?? {}) as Record<string, unknown>;
  const fitRaw = String(expRaw.fit ?? "Unknown");
  const fit = (["Above", "Within", "Below", "Unknown"].includes(fitRaw) ? fitRaw : "Unknown") as "Above" | "Within" | "Below" | "Unknown";

  return {
    overallScore: overall,
    verdict,
    summary: String(r.summary ?? ""),
    experienceMatch: { fit, notes: String(expRaw.notes ?? "") },
    breakdown,
    strengths: Array.isArray(r.strengths) ? (r.strengths as unknown[]).map(String) : [],
    gaps: Array.isArray(r.gaps) ? (r.gaps as unknown[]).map(String) : [],
    model: String(r.model ?? ""),
  };
}

const SCORING_RULES = `You are an ATS (Applicant Tracking System) scorer.
You will receive a Job Description, skill weights (each skill has weight 1-10 representing importance), and a resume.
Score the candidate strictly against the WEIGHTED skills. Do not penalise for missing unlisted skills.

Scoring rules:
- For each weighted skill, determine: matched (boolean), partialCredit (0 to 1), and a short evidence snippet from the resume (or empty string if none).
- partialCredit = 1 for clearly demonstrated expertise (projects, years, deep experience)
- partialCredit = 0.75 for solid experience
- partialCredit = 0.5 for mentioned with some usage
- partialCredit = 0.25 for just listed in skill section
- partialCredit = 0 for absent
- overallScore = round( sum(weight_i * partialCredit_i) / sum(weight_i) * 100 )
- verdict: StrongMatch (>=85), GoodMatch (>=70), PartialMatch (>=50), WeakMatch (>=25), NoMatch (<25)
- experienceMatch.fit: compare candidate years to required range ("Above" / "Within" / "Below" / "Unknown").
- Provide 2-4 strengths and 2-4 gaps as short phrases.
- summary: one-sentence overall verdict.

Output MUST be valid JSON matching this shape (and nothing else — no markdown fences):
{
  "overallScore": number,
  "verdict": "StrongMatch"|"GoodMatch"|"PartialMatch"|"WeakMatch"|"NoMatch",
  "summary": string,
  "experienceMatch": { "fit": "Above"|"Within"|"Below"|"Unknown", "notes": string },
  "breakdown": [{ "skill": string, "weight": number, "matched": boolean, "partialCredit": number, "evidence": string }],
  "strengths": string[],
  "gaps": string[]
}`;

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) return text.slice(firstBrace, lastBrace + 1);
  return text;
}

export async function scoreResumeAgainstJD(input: ATSScoreInput): Promise<ATSScoreResult> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }
  if (!input.skillWeights || input.skillWeights.length === 0) {
    throw new Error("skillWeights required for ATS scoring");
  }

  const model = process.env.OPENROUTER_ATS_MODEL ?? "openai/gpt-4o-mini";
  const maxTokens = Number(process.env.OPENROUTER_ATS_MAX_TOKENS ?? 2500);

  const client = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
    ...(process.env.OPENROUTER_APP_URL || process.env.OPENROUTER_APP_TITLE
      ? {
          defaultHeaders: {
            ...(process.env.OPENROUTER_APP_URL ? { "HTTP-Referer": process.env.OPENROUTER_APP_URL } : {}),
            ...(process.env.OPENROUTER_APP_TITLE ? { "X-OpenRouter-Title": process.env.OPENROUTER_APP_TITLE } : {}),
          },
        }
      : {}),
  });

  const trimmedResume = input.resumeText.length > 12000
    ? input.resumeText.slice(0, 12000) + "\n...[truncated]"
    : input.resumeText;

  const userPayload = {
    job: {
      title: input.jobTitle,
      description: input.jobDescription ?? "",
      experienceMin: input.experienceMin ?? null,
      experienceMax: input.experienceMax ?? null,
    },
    skillWeights: input.skillWeights,
    candidate: {
      summary: input.candidateSummary ?? "",
      experienceMonths: input.candidateExperienceMonths ?? null,
      declaredSkills: input.candidateSkills ?? [],
      resumeText: trimmedResume,
    },
  };

  const completion = await client.chat.send({
    chatRequest: {
      model,
      temperature: 0.1,
      maxTokens,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: SCORING_RULES },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      stream: false,
    },
  });

  const msgContent = completion.choices[0]?.message?.content;
  const text = typeof msgContent === "string"
    ? msgContent
    : Array.isArray(msgContent)
      ? msgContent.map((c) => (typeof c === "object" && c && "text" in c ? String((c as { text: unknown }).text) : "")).join("")
      : "";
  if (!text) throw new Error("OpenRouter returned empty response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    throw new Error("OpenRouter returned invalid JSON");
  }

  const result = normalizeResponse(parsed, input.skillWeights);
  result.model = model;
  return result;
}

/**
 * Build a simple resumeText string from parsedResume JSON (Gemini output)
 * — used as fallback when raw resume text isn't available.
 */
export function parsedResumeToText(parsed: Record<string, unknown> | null | undefined): string {
  if (!parsed) return "";
  const lines: string[] = [];
  if (parsed.summary) lines.push(`Summary: ${parsed.summary}`);
  if (parsed.currentDesignation) lines.push(`Current Role: ${parsed.currentDesignation}${parsed.currentCompany ? ` at ${parsed.currentCompany}` : ""}`);
  if (parsed.totalExperienceMonths) {
    const months = Number(parsed.totalExperienceMonths);
    lines.push(`Experience: ${(months / 12).toFixed(1)} years (${months} months)`);
  }
  if (Array.isArray(parsed.skills)) lines.push(`Skills: ${(parsed.skills as string[]).join(", ")}`);
  if (parsed.location) lines.push(`Location: ${parsed.location}`);
  return lines.join("\n");
}
