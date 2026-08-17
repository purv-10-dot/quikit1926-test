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

/**
 * AI ATS scoring is temporarily disabled — the direct OpenRouter call has
 * been removed pending migration to @quikit/ai-sdk. Callers already treat
 * this as a normal failure (caught + surfaced as an error / logged), so this
 * throws rather than silently returning a fake score.
 */
export async function scoreResumeAgainstJD(_input: ATSScoreInput): Promise<ATSScoreResult> {
  throw new Error("AI ATS scoring is currently unavailable.");
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
