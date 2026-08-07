import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAiInsights } from "@/lib/insights/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/insights → { insights, recommendations, activity }
// AI-generated and gated to at most one LLM call per user per 24h (see
// lib/insights/ai.ts); falls back to the rule-based engine with no key / on error.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await getAiInsights(session.user.id, session.user.orgId as string);
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ insights: [], recommendations: [], activity: [] });
  }
}
