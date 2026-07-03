import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_MODEL = "claude-3-5-sonnet-latest";
const schema = z.object({ prompt: z.string().trim().min(1).max(2000) });

export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Ask a question." });
  const prompt = parsed.data.prompt;

  // Key: org setting first, then a server env fallback.
  const orgRows = (await prisma.$queryRaw`SELECT ai_api_key, ai_model, name, base_currency FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ ai_api_key: string | null; ai_model: string | null; name: string | null; base_currency: string | null }>;
  const apiKey = orgRows[0]?.ai_api_key || process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) {
    return ok({ configured: false, answer: "AI answers aren't enabled yet. Add your Anthropic API key in Settings → AI Assistant to turn this on." });
  }
  const model = orgRows[0]?.ai_model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const currency = orgRows[0]?.base_currency ?? "INR";

  // Ground the model with a compact, real financial snapshot from the ledger.
  let snapshot = "";
  try {
    const t = (await prisma.$queryRaw`
      SELECT
        COALESCE(SUM(CASE WHEN account_type IN ('cash','bank') THEN balance ELSE 0 END),0) AS cash,
        COALESCE(SUM(CASE WHEN account_type='accounts_receivable' THEN balance ELSE 0 END),0) AS ar,
        COALESCE(SUM(CASE WHEN account_type='accounts_payable' THEN balance ELSE 0 END),0) AS ap,
        COALESCE(SUM(CASE WHEN account_type IN ('revenue','other_income') THEN balance ELSE 0 END),0) AS income,
        COALESCE(SUM(CASE WHEN account_type IN ('expense','cost_of_goods_sold','other_expense') THEN balance ELSE 0 END),0) AS expense
      FROM v_account_balances WHERE org_id = ${orgId}::uuid
    `) as Array<Record<string, string>>;
    const s = t[0] ?? {};
    snapshot = `Current ledger snapshot (base currency ${currency}): cash & bank ${s.cash}, receivables ${s.ar}, payables ${s.ap}, income ${s.income}, expenses ${s.expense}, net profit ${Number(s.income ?? 0) - Number(s.expense ?? 0)}.`;
  } catch {
    snapshot = "";
  }

  const system = [
    `You are the AI assistant inside QuikFinance, an accounting platform for ${orgRows[0]?.name ?? "this business"}.`,
    "Answer concisely and practically for a business owner. Use the snapshot below when relevant; if you lack data, say what report to open.",
    snapshot
  ].filter(Boolean).join(" ");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 1024, system, messages: [{ role: "user", content: prompt }] })
    });
    const data = (await res.json().catch(() => null)) as { content?: Array<{ text?: string }>; error?: { message?: string } } | null;
    if (!res.ok) {
      const msg = data?.error?.message ?? `AI request failed (${res.status}).`;
      return ok({ configured: true, error: true, answer: res.status === 401 ? "That Anthropic API key was rejected. Check it in Settings → AI Assistant." : msg });
    }
    const answer = (data?.content ?? []).map((c) => c.text ?? "").join("").trim() || "(no answer)";
    return ok({ configured: true, answer, model });
  } catch (error) {
    return fail(502, { code: "AI_UPSTREAM", message: errorMessage(error) });
  }
}
