/**
 * Analyze a meeting transcript.
 *
 * Input: raw transcript text (paste from Meet / Zoom).
 * Output: summary + key points + red flags + action items + sentiment.
 *
 * Red flags get auto-promoted to VCDealSignal rows by the calling endpoint
 * so they surface in the Risk Register without analyst manual entry.
 */
import { callClaude, parseJsonResponse, MODEL_SONNET } from "../claude";

export interface TranscriptAnalysis {
  summary: string;
  keyPoints: string[];
  redFlags: { title: string; description: string; severity: "red" | "amber" }[];
  actionItems: { owner: string; description: string }[];
  sentiment: "positive" | "neutral" | "cautious" | "negative";
}

const SYSTEM_PROMPT = `You analyze VC discovery / partner / IC call transcripts and extract structured signals for analysts.

Conventions:
- Concise. Partners read your output, not the raw transcript.
- summary: 2-4 sentences, neutral tone, captures the call's main thread.
- keyPoints: 3-7 bullet points, factual, ordered most → least important.
- redFlags: surface concerns the analyst should track. severity = "red" for
  blockers / contradictions / fundamental risks; "amber" for caution items
  that need follow-up. Empty array if nothing concerning.
- actionItems: tasks promised on the call. Owner = "founder" / "analyst" /
  "partner" or a specific name if cited. Empty array if none.
- sentiment: overall founder/team affect: "positive" (confident, candid),
  "neutral" (factual, terse), "cautious" (defensive, hedging), "negative"
  (combative, evasive).

Return STRICT JSON only. No markdown, no preamble. Schema:
{
  "summary": "<2-4 sentences>",
  "keyPoints": ["<bullet>"],
  "redFlags": [{ "title": "<short>", "description": "<1-2 sentences>", "severity": "red"|"amber" }],
  "actionItems": [{ "owner": "<role or name>", "description": "<task>" }],
  "sentiment": "positive"|"neutral"|"cautious"|"negative"
}`;

export async function analyzeTranscript(
  rawTranscript: string,
  context?: { startupName?: string; meetingType?: string },
): Promise<{ analysis: TranscriptAnalysis; tokensUsed: number; isStub: boolean }> {
  const r = await callClaude({
    system: SYSTEM_PROMPT,
    prompt: `${context?.startupName ? `STARTUP: ${context.startupName}\n` : ""}${
      context?.meetingType ? `MEETING TYPE: ${context.meetingType}\n` : ""
    }
TRANSCRIPT:
${rawTranscript}

Return JSON now.`,
    model: MODEL_SONNET,
    maxTokens: 2500,
    context: `analyze-transcript:${context?.startupName ?? "unknown"}`,
  });

  if (r.isStub) {
    return {
      analysis: {
        summary: "[AI stub] Transcript analysis pending. Set ANTHROPIC_API_KEY to enable.",
        keyPoints: [],
        redFlags: [],
        actionItems: [],
        sentiment: "neutral",
      },
      tokensUsed: 0,
      isStub: true,
    };
  }

  const parsed = parseJsonResponse<TranscriptAnalysis>(r.text);
  return {
    analysis: parsed,
    tokensUsed: r.usage.inputTokens + r.usage.outputTokens,
    isStub: false,
  };
}
