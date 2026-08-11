import type { QcfCampaign } from "@quikit/database";

export interface CampaignDetailDto {
  id: string;
  name: string;
  status: string;
  type: string | null;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  budgetCurrency: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

function readConfig(config: QcfCampaign["config"]): Record<string, unknown> {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    return config as Record<string, unknown>;
  }
  return {};
}

export function serializeCampaign(c: QcfCampaign): CampaignDetailDto {
  const cfg = readConfig(c.config);
  const budget = typeof cfg.budget === "number" ? cfg.budget : null;
  const budgetCurrency =
    typeof cfg.budgetCurrency === "string" ? cfg.budgetCurrency : "INR";
  const description = typeof cfg.description === "string" ? cfg.description : null;

  return {
    id: c.id,
    name: c.name,
    status: c.status,
    type: c.type,
    startDate: c.startDate?.toISOString() ?? null,
    endDate: c.endDate?.toISOString() ?? null,
    budget,
    budgetCurrency,
    description,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function formatCampaignBudget(
  budget: number | null,
  currency: string,
): string {
  if (budget == null || !Number.isFinite(budget)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    }).format(budget);
  } catch {
    return String(budget);
  }
}

export function formatCampaignDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
