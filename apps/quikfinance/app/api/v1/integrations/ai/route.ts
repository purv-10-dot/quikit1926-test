import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";
import { runIntegrationAi, parseAiJson } from "@/lib/integrations/ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Common QuikFinance target fields per entity, to ground mapping suggestions.
const TARGETS: Record<string, string[]> = {
  customers: ["display_name", "email", "phone", "tax_id", "pan", "currency", "billing_address"],
  vendors: ["display_name", "email", "phone", "tax_id", "pan", "currency"],
  products: ["name", "sku", "sales_price", "purchase_price", "unit", "hsn_sac_code"],
  services: ["name", "sku", "sales_price", "unit"],
  chart_of_accounts: ["name", "account_type", "code"],
  taxes: ["name", "rate", "tax_type"],
  invoices: ["invoice_number", "contact_id", "invoice_date", "due_date", "total", "status"]
};

/**
 * AI assistance for integrations.
 * Body: { action, ... }
 *   suggest_mappings:   { entity, sourceFields[] }            → [{ sourceField, targetField, transform }]
 *   analysis_summary:   { analysis }                          → plain-English risk summary
 *   conflict_suggestion:{ entity, fieldDiffs[] }              → { strategy, reasoning }
 */
export async function POST(request: NextRequest) {
  const guard = await integrationContext("write");
  if (!guard.ok) return guard.response;
  const { prisma, orgId } = guard.context;

  try {
    const body = (await request.json()) as {
      action?: string; entity?: string; sourceFields?: string[];
      analysis?: unknown; fieldDiffs?: Array<{ field: string; internal: unknown; external: unknown }>;
    };

    if (body.action === "suggest_mappings") {
      const targets = TARGETS[body.entity ?? ""] ?? [];
      const system = "You are a data-integration mapping expert. Map external accounting fields to QuikFinance fields. Reply ONLY with a JSON array of {sourceField, targetField, transform} where transform is one of none|trim|uppercase|lowercase|number|date_format. Only include confident mappings.";
      const prompt = `Entity: ${body.entity}.\nExternal source fields: ${JSON.stringify(body.sourceFields ?? [])}.\nQuikFinance target fields: ${JSON.stringify(targets)}.`;
      const res = await runIntegrationAi(prisma, orgId, system, prompt, 800);
      if (!res.configured || res.error) return ok({ configured: res.configured, error: res.error ?? false, message: res.text, suggestions: [] });
      const suggestions = parseAiJson<Array<{ sourceField: string; targetField: string; transform: string }>>(res.text) ?? [];
      return ok({ configured: true, suggestions });
    }

    if (body.action === "analysis_summary") {
      const system = "You are a migration risk analyst. Given a migration analysis JSON, give a concise (max 5 bullet) plain-English assessment for a business owner: data volume, duplicate/invalid risks, and a go/no-go recommendation for a live import.";
      const res = await runIntegrationAi(prisma, orgId, system, `Migration analysis:\n${JSON.stringify(body.analysis)}`, 600);
      return ok({ configured: res.configured, error: res.error ?? false, summary: res.text });
    }

    if (body.action === "conflict_suggestion") {
      const system = "You resolve data sync conflicts. Given field differences between the QuikFinance (internal) and external record, reply ONLY with JSON {strategy, reasoning} where strategy is one of latest_wins|quikfinance_wins|external_wins|merge.";
      const res = await runIntegrationAi(prisma, orgId, system, `Entity: ${body.entity}.\nField differences: ${JSON.stringify(body.fieldDiffs ?? [])}.`, 400);
      if (!res.configured || res.error) return ok({ configured: res.configured, error: res.error ?? false, message: res.text });
      const parsed = parseAiJson<{ strategy: string; reasoning: string }>(res.text);
      return ok({ configured: true, suggestion: parsed ?? { strategy: "manual", reasoning: res.text } });
    }

    return fail(422, { code: "UNKNOWN_ACTION", message: "Unknown AI action." });
  } catch (error) {
    return fail(400, { code: "AI_FAILED", message: errorMessage(error) });
  }
}
