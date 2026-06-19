/**
 * Generate a single IC memo section.
 *
 * Per-section calls keep token usage low + give the analyst granular control
 * over what's AI-generated vs hand-edited. Output is HTML-safe rich text
 * (the editor renders it inline).
 */
import { callClaude, MODEL_SONNET } from "../claude";

export type MemoSectionSlug =
  | "business-overview"
  | "financial-analysis"
  | "market-assessment"
  | "risk-factors"
  | "deal-structure"
  | "recommendation";

export const MEMO_SECTIONS: { slug: MemoSectionSlug; title: string; brief: string }[] = [
  { slug: "business-overview",   title: "Business Overview",   brief: "What the startup does, problem it solves, who buys, and traction so far." },
  { slug: "financial-analysis",  title: "Financial Analysis",  brief: "Revenue trend, unit economics, burn, runway, key ratios." },
  { slug: "market-assessment",   title: "Market Assessment",   brief: "TAM/SAM/SOM, growth rate, competitive intensity, regulatory tailwinds/headwinds." },
  { slug: "risk-factors",        title: "Risk Factors",        brief: "Top 3-5 risks with severity. Cite signals from the deal data when available." },
  { slug: "deal-structure",      title: "Deal Structure",      brief: "Proposed terms, instrument, tenure, security, covenants." },
  { slug: "recommendation",      title: "Recommendation",      brief: "Approve / Conditional Approve / Reject + 2-sentence rationale." },
];

export interface MemoContext {
  startupName: string;
  description: string;
  sector: string;
  fundingAskInr: number;
  loanType: string;
  teamSize: number | null;
  monthlyRevenueLakhs: number | null;
  ebitdaLakhs: number | null;
  /** Per-criterion analyst-final scores (0-100). Used to ground rec section. */
  scores?: { criterionName: string; score: number }[];
  /** Risk signals (sorted by severity, red first). Used to ground risk-factors section. */
  signals?: { severity: string; title: string; description: string | null }[];
}

const SYSTEM_PROMPT = `You are a senior VC analyst drafting a section of an Investment Committee memo.

Conventions:
- Concise. Partners read at most 2 minutes per memo.
- Use specific numbers from the deal data, not generic claims.
- 2-4 short paragraphs OR a tight bulleted list, depending on the section.
- Do NOT invent data. If something isn't provided, write "[Data not provided]" so the analyst can fill it in.
- Do NOT use markdown headings (#, ##) — the editor renders sections as separate blocks.
- Output safe HTML only: <p>, <ul>, <li>, <strong>, <em>. No <script>, no inline styles.
- Reference deal scores and risk signals where relevant.`;

function buildPrompt(section: MemoSectionSlug, ctx: MemoContext): string {
  const sectionMeta = MEMO_SECTIONS.find((s) => s.slug === section);
  const sectionBrief = sectionMeta?.brief ?? "";

  const scoreLines = ctx.scores?.length
    ? "ANALYST SCORES (0-100):\n" + ctx.scores.map((s) => `  - ${s.criterionName}: ${s.score}`).join("\n")
    : "";
  const signalLines = ctx.signals?.length
    ? "RISK SIGNALS:\n" + ctx.signals.map((s) => `  - [${s.severity.toUpperCase()}] ${s.title}${s.description ? `: ${s.description}` : ""}`).join("\n")
    : "";

  return `Generate the "${sectionMeta?.title}" section.
Section purpose: ${sectionBrief}

DEAL DATA:
Startup: ${ctx.startupName}
Sector: ${ctx.sector}
Funding ask: ₹${ctx.fundingAskInr}L (${ctx.loanType})
Team size: ${ctx.teamSize ?? "unknown"}
Monthly revenue: ${ctx.monthlyRevenueLakhs != null ? `₹${ctx.monthlyRevenueLakhs}L` : "unknown"}
EBITDA: ${ctx.ebitdaLakhs != null ? `₹${ctx.ebitdaLakhs}L` : "unknown"}

DESCRIPTION:
${ctx.description}

${scoreLines}

${signalLines}

Return ONLY the section HTML content. No <h1>/<h2> headings. No commentary outside the HTML.`;
}

export async function generateMemoSection(
  section: MemoSectionSlug,
  ctx: MemoContext,
): Promise<{ html: string; tokensUsed: number; isStub: boolean }> {
  const r = await callClaude({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(section, ctx),
    model: MODEL_SONNET,
    maxTokens: 1200,
    context: `memo:${section}:${ctx.startupName}`,
  });

  if (r.isStub) {
    const meta = MEMO_SECTIONS.find((s) => s.slug === section);
    return {
      html: `<p><em>AI stub — set ANTHROPIC_API_KEY to generate real content for "${meta?.title}".</em></p><p>This section will cover: ${meta?.brief ?? ""}</p>`,
      tokensUsed: 0,
      isStub: true,
    };
  }

  return {
    html: r.text,
    tokensUsed: r.usage.inputTokens + r.usage.outputTokens,
    isStub: false,
  };
}
