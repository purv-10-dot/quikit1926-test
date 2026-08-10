import { prisma } from "@/lib/prisma";
import { buildReportForUser } from "@/lib/insights/report";
import { hasSufficientTokens, recordUsage, estimateTokens } from "@/lib/tokens/service";
import type { InsightsReport } from "@/lib/insights/types";

// Contract returned to the UI (same shape /api/insights always returned).
export interface AiInsightsPayload {
  insights: { id: string; status: "attention" | "good" | "decision"; title: string; meta: string; resolved: boolean }[];
  recommendations: { id: string; label: string; body: string; suggestedQuestion: string }[];
  activity: { text: string; time: string }[];
}

const TTL_MS = 24 * 60 * 60 * 1000; // hard cap: <=1 LLM call per user per 24h
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-1.5-flash-latest";

// ── Rule-based fallback (free) — also the grounding facts for the LLM ────────
function ruleBased(report: InsightsReport): AiInsightsPayload {
  const insights = report.sections.map((s, i) => ({
    id: `ins_${s.key}_${i}`,
    status: (s.suggestions.length ? "attention" : "good") as "attention" | "good",
    title: s.summary,
    meta: s.title,
    resolved: false,
  }));
  const recommendations = report.sections.flatMap((s) =>
    s.suggestions.map((body, i) => ({ id: `rec_${s.key}_${i}`, label: s.title, body, suggestedQuestion: body }))
  );
  const activity = report.sections.map((s) => ({ text: s.summary, time: "this week" }));
  return { insights, recommendations, activity };
}

// ── One Gemini call that produces all cards, grounded in the rule-based facts ─
async function geminiInsights(
  key: string,
  report: InsightsReport
): Promise<{ payload: AiInsightsPayload; inputTokens: number; outputTokens: number }> {
  const facts = report.sections
    .map((s) => `## ${s.title}\nSummary: ${s.summary}\nSignals: ${s.suggestions.join(" | ") || "none"}`)
    .join("\n\n");

  const prompt =
    `You are a marketing analyst. Using ONLY the grounded facts below (do not invent numbers), write concise dashboard content. ` +
    `Return STRICT JSON with this shape:\n` +
    `{"insights":[{"status":"attention|good|decision","title":"1-sentence insight","meta":"which area"}],` +
    `"recommendations":[{"label":"short label","body":"1-2 sentence action","suggestedQuestion":"a question to ask AI"}],` +
    `"activity":[{"text":"short activity line","time":"this week"}]}\n\n` +
    `Facts for ${report.periodLabel}:\n${facts}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  const parsed = JSON.parse(text) as Partial<AiInsightsPayload>;

  // Extract real token counts from Gemini's usageMetadata when available.
  const inputTokens: number = json?.usageMetadata?.promptTokenCount ?? estimateTokens(prompt);
  const outputTokens: number = json?.usageMetadata?.candidatesTokenCount ?? estimateTokens(text);

  // Normalise + id the LLM output; fall back per-field if missing.
  const rb = ruleBased(report);
  const normalised: AiInsightsPayload = {
    insights: (parsed.insights ?? []).map((x, i) => ({
      id: `ai_ins_${i}`,
      status: (["attention", "good", "decision"].includes((x as any).status) ? (x as any).status : "good"),
      title: String((x as any).title ?? ""),
      meta: String((x as any).meta ?? ""),
      resolved: false,
    })).filter((x) => x.title) || rb.insights,
    recommendations: (parsed.recommendations ?? []).map((x, i) => ({
      id: `ai_rec_${i}`,
      label: String((x as any).label ?? "Recommendation"),
      body: String((x as any).body ?? ""),
      suggestedQuestion: String((x as any).suggestedQuestion ?? (x as any).body ?? ""),
    })).filter((x) => x.body),
    activity: (parsed.activity ?? []).map((x) => ({ text: String((x as any).text ?? ""), time: String((x as any).time ?? "this week") })).filter((x) => x.text),
  };
  return { payload: normalised, inputTokens, outputTokens };
}

/**
 * Returns the AI card content for a user, calling the LLM at most once per 24h
 * (the ai_insight_cache row is the gate). Everything is produced in ONE Gemini
 * call; falls back to the free rule-based engine when no key / on error.
 */
export async function getAiInsights(userId: string, orgId: string): Promise<AiInsightsPayload> {
  // 1. 24h gate.
  const cached = await prisma.aiInsightCache.findUnique({ where: { userId } }).catch(() => null);
  if (cached && Date.now() - cached.generatedAt.getTime() < TTL_MS) {
    return cached.data as unknown as AiInsightsPayload;
  }

  // 2. Grounding facts (also the fallback).
  const report = await buildReportForUser(userId, "WEEKLY");
  let payload = ruleBased(report);
  let source = "rules";

  // 3. One LLM call (only if configured, there's something to analyse, and user has tokens).
  const key = process.env.GEMINI_API_KEY;
  if (key && !report.empty) {
    // Rough pre-call estimate so we can bail early if the balance is too low.
    const estimatedCost = estimateTokens(
      report.sections.map((s) => s.summary + s.suggestions.join(" ")).join(" ")
    );
    const sufficient = await hasSufficientTokens(userId, orgId, estimatedCost).catch(() => false);
    if (!sufficient) {
      await recordUsage({
        userId, orgId, feature: "insights", inputTokens: 0, outputTokens: 0, status: "limit_exceeded",
      }).catch(() => { /* best-effort */ });
    } else {
      try {
        const { payload: aiPayload, inputTokens, outputTokens } = await geminiInsights(key, report);
        payload = aiPayload;
        source = "ai";
        await recordUsage({ userId, orgId, feature: "insights", inputTokens, outputTokens, status: "success" })
          .catch(() => { /* best-effort */ });
      } catch {
        /* keep rule-based fallback */
      }
    }
  }

  // 4. Persist → gates the next 24h.
  await prisma.aiInsightCache.upsert({
    where: { userId },
    create: { userId, orgId, data: payload as unknown as object, source },
    update: { data: payload as unknown as object, source, generatedAt: new Date() },
  }).catch(() => { /* cache write is best-effort */ });

  return payload;
}
