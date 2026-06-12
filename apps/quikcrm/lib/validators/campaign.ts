import { z } from "zod";

export const CAMPAIGN_TYPES = ["Email", "SMS", "Social", "Webinar", "Other"] as const;
export const CAMPAIGN_STATUSES = ["Draft", "Scheduled", "Active", "Paused", "Completed"] as const;

const campaignBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  type: z.string().trim().max(50).optional().nullable(),
  status: z.string().trim().max(50).optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  budget: z.coerce.number().nonnegative("Budget must be zero or greater").optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  config: z.record(z.unknown()).optional(),
});

function campaignDateRangeRefine<T extends { startDate?: string | null; endDate?: string | null }>(
  v: T,
) {
  if (!v.startDate?.trim() || !v.endDate?.trim()) return true;
  return new Date(v.endDate) >= new Date(v.startDate);
}

export const createCampaignSchema = campaignBodySchema.refine(campaignDateRangeRefine, {
  message: "End date must be on or after start date",
  path: ["endDate"],
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = campaignBodySchema.partial().refine(campaignDateRangeRefine, {
  message: "End date must be on or after start date",
  path: ["endDate"],
});

export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export function parseOptionalCampaignDate(value: string | null | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function buildCampaignConfig(input: {
  budget?: number | null;
  description?: string | null;
  config?: Record<string, unknown>;
}): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = { ...(input.config ?? {}) };
  if (input.budget != null && !Number.isNaN(input.budget)) {
    merged.budget = input.budget;
    merged.budgetCurrency = "INR";
  }
  const desc = input.description?.trim();
  if (desc) merged.description = desc;
  return Object.keys(merged).length > 0 ? merged : undefined;
}
