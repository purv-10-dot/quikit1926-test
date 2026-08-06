import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAggregatedDashboard } from "@/lib/data/aggregator";
import { getAggCache } from "@/lib/dashboardCache";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { estimateTokens, hasSufficientTokens, recordUsage } from "@/lib/tokens/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-1.5-flash-latest";

// Build a compact, grounded metrics summary from the user's real aggregated
// data — this is the "semantic layer" the LLM is grounded on (not raw tables).
function summarizeMetrics(data: Awaited<ReturnType<typeof getAggregatedDashboard>>): string {
  const kpis = (data.kpis ?? []).map((k) => `${k.label}: ${k.value}`).join(", ");
  const channels = (data.channels ?? [])
    .slice(0, 8)
    .map((c) => `${c.name} (reach ${c.reach}, engagement ${c.engagePercent ?? "n/a"}%)`)
    .join("; ");
  const p = data.platforms ?? {};
  const platforms: string[] = [];
  if (p.ga4) platforms.push(`GA4 sessions ${p.ga4.totalSessions}, users ${p.ga4.totalUsers}`);
  if (p.gsc) platforms.push(`Search Console clicks ${p.gsc.clicks}, impressions ${p.gsc.impressions}`);
  if (p.hubspot) platforms.push(`HubSpot leads ${p.hubspot.leads}, pipeline ${p.hubspot.pipeline}, revenue ${p.hubspot.revenue}`);
  if (p.youtube) platforms.push(`YouTube views ${p.youtube.analytics.views}, subs ${p.youtube.channelStats.subscribers}`);
  return [
    `Week: ${data.week}`,
    kpis && `KPIs: ${kpis}`,
    channels && `Channels: ${channels}`,
    platforms.length ? `Platforms: ${platforms.join("; ")}` : "No platforms connected yet.",
  ]
    .filter(Boolean)
    .join("\n");
}

// POST /api/ask-ai  { question: string } → { text, suggestions? }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const orgId  = (session.user.orgId as string) ?? "";

  let question = "";
  try {
    question = String(((await req.json()) as { question?: unknown }).question ?? "").trim();
  } catch {
    /* ignore */
  }
  if (!question) return NextResponse.json({ error: "question is required" }, { status: 400 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({
      text: "Ask AI isn't fully configured yet. Add a GEMINI_API_KEY on the server to get answers grounded in your live metrics.",
    });
  }

  // Token gate — estimate prompt tokens before calling Gemini.
  const estimatedInput = estimateTokens(question) + 500; // 500 for system prompt + context overhead
  const canProceed = await hasSufficientTokens(userId, orgId, estimatedInput).catch(() => true);
  if (!canProceed) {
    return NextResponse.json({ text: "You've used all your AI tokens for this period. Please contact support to top up." });
  }

  // Use the in-memory cache for context — don't block on a fresh aggregation.
  let context = "No metrics available.";
  try {
    const workspaceId = await getActiveWorkspaceId(userId, orgId);
    const cached = getAggCache(userId, 28, workspaceId);
    const data = cached ?? await Promise.race([
      getAggregatedDashboard(userId, 28, workspaceId),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
    ]);
    if (data) context = summarizeMetrics(data as Awaited<ReturnType<typeof getAggregatedDashboard>>);
  } catch {
    /* fall through with default context */
  }

  const prompt =
    `You are QuikInsight's marketing analyst assistant. Answer the user's question using ONLY the metrics below. ` +
    `If the metrics don't contain the answer, say so plainly and suggest what to connect. Be concise (2-4 sentences), specific, and cite the numbers.\n\n` +
    `=== LIVE METRICS ===\n${context}\n\n=== QUESTION ===\n${question}`;

  const inputTokens = estimateTokens(prompt);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!res.ok) {
      const detail = await res.text();
      console.error("[ask-ai] Gemini error", res.status, detail.slice(0, 300));
      await recordUsage({ userId, orgId, feature: "ask_ai", inputTokens, outputTokens: 0, status: "error" }).catch(() => {});
      return NextResponse.json({ text: "I couldn't reach the AI service just now. Please try again in a moment." });
    }
    const json = await res.json();
    const text =
      json?.candidates?.[0]?.content?.parts?.map((pt: { text?: string }) => pt.text ?? "").join("") ||
      "I couldn't find an answer for that in your current metrics.";

    const outputTokens = estimateTokens(text);
    await recordUsage({ userId, orgId, feature: "ask_ai", model: GEMINI_MODEL, inputTokens, outputTokens, status: "success" }).catch(() => {});

    return NextResponse.json({ text });
  } catch (err) {
    console.error("[ask-ai] request failed", err);
    await recordUsage({ userId, orgId, feature: "ask_ai", inputTokens, outputTokens: 0, status: "error" }).catch(() => {});
    return NextResponse.json({ text: "Something went wrong reaching the AI service. Please try again." });
  }
}
