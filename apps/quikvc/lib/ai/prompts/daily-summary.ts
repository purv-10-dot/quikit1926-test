/**
 * Daily AI summary — per-tenant morning briefing.
 *
 * Cheap (Haiku). Input: signal counts + a short list of "what changed
 * yesterday" facts. Output: 3-5 line plain-English briefing the analyst
 * scans in <60 seconds.
 */
import { callClaude, MODEL_HAIKU } from "../claude";

export interface DailySummaryInput {
  tenantName: string;
  activeDeals: number;
  openQuestions: number;
  recentDocs: number;
  redSignals: number;
  amberSignals: number;
  newDealsLast24h: number;
  /** A few concrete events to ground the summary in. */
  recentHighlights: string[];
}

const SYSTEM_PROMPT = `You write 1-paragraph morning briefings for VC analysts.

Conventions:
- 60-100 words MAX. The analyst reads it in 30 seconds.
- Plain prose. No bullet points, no markdown, no headings.
- Lead with the most actionable thing.
- Use specific numbers when given. Avoid filler ("good morning", "hope you're well").
- If everything's quiet, say so concisely. Don't pad.`;

export async function generateDailySummary(
  input: DailySummaryInput,
): Promise<{ text: string; tokensUsed: number; isStub: boolean }> {
  const r = await callClaude({
    system: SYSTEM_PROMPT,
    prompt: `${input.tenantName} pipeline state:
- ${input.activeDeals} active deals (${input.newDealsLast24h} new in last 24h)
- ${input.openQuestions} open Q&A awaiting founder
- ${input.recentDocs} documents uploaded yesterday under review
- ${input.redSignals} red, ${input.amberSignals} amber risk signals open

Highlights:
${input.recentHighlights.length > 0 ? input.recentHighlights.map((h) => `- ${h}`).join("\n") : "(no notable events)"}

Write the morning briefing.`,
    model: MODEL_HAIKU,
    maxTokens: 250,
    context: `daily-summary:${input.tenantName}`,
  });

  return {
    text: r.text.trim(),
    tokensUsed: r.usage.inputTokens + r.usage.outputTokens,
    isStub: r.isStub,
  };
}
