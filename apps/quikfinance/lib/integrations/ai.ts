import type { PrismaClient } from "@prisma/client";
import { FEATURE_FLAGS } from "./config";

/**
 * AI helper for the integration platform. Reuses the org's Anthropic key
 * (organizations.ai_api_key) with an env fallback — same path as the in-app AI
 * assistant. Degrades gracefully (configured:false) when no key / flag off.
 */

const DEFAULT_MODEL = "claude-3-5-sonnet-latest";

type AiResult = { configured: boolean; text: string; error?: boolean };

export async function runIntegrationAi(prisma: PrismaClient, orgId: string, system: string, prompt: string, maxTokens = 1024): Promise<AiResult> {
  if (!FEATURE_FLAGS.ai) return { configured: false, text: "AI assistance is disabled for this workspace." };
  const rows = (await prisma.$queryRaw`SELECT ai_api_key, ai_model FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ ai_api_key: string | null; ai_model: string | null }>;
  const apiKey = rows[0]?.ai_api_key || process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) return { configured: false, text: "Add an Anthropic API key in Settings → AI Assistant to enable AI suggestions." };
  const model = rows[0]?.ai_model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] })
    });
    const data = (await res.json().catch(() => null)) as { content?: Array<{ text?: string }>; error?: { message?: string } } | null;
    if (!res.ok) {
      return { configured: true, error: true, text: res.status === 401 ? "The Anthropic API key was rejected." : (data?.error?.message ?? `AI request failed (${res.status}).`) };
    }
    return { configured: true, text: (data?.content ?? []).map((c) => c.text ?? "").join("").trim() || "(no response)" };
  } catch (error) {
    return { configured: true, error: true, text: error instanceof Error ? error.message : "AI request failed." };
  }
}

/** Best-effort JSON extraction from a model response (handles ```json fences). */
export function parseAiJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(raw) as T;
  } catch {
    const first = raw.indexOf("[") >= 0 ? raw.indexOf("[") : raw.indexOf("{");
    const last = Math.max(raw.lastIndexOf("]"), raw.lastIndexOf("}"));
    if (first >= 0 && last > first) {
      try { return JSON.parse(raw.slice(first, last + 1)) as T; } catch { return null; }
    }
    return null;
  }
}
