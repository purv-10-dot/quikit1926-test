import type { LeadScoringConfig, LeadScoringRule } from "@/lib/services/leads/lead-scoring/types";

/** Client-safe defaults (no Prisma). */
export const DEFAULT_LEAD_SCORING_CONFIG: LeadScoringConfig = {
  enabled: true,
  autoRecalculate: true,
  allowManualOverride: false,
  rules: [],
  behavior: { enabled: true, maxBaselinePoints: 55 },
};

/** Starter pack users can add in one click from settings. */
export function recommendedLeadScoringRules(): LeadScoringRule[] {
  const id = () => `rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return [
    {
      id: id(),
      label: "Referral source",
      enabled: true,
      field: "source",
      operator: "contains",
      value: "referral",
      points: 20,
    },
    {
      id: id(),
      label: "Qualified stage",
      enabled: true,
      field: "stage",
      operator: "contains",
      value: "qualified",
      points: 15,
    },
    {
      id: id(),
      label: "Has email",
      enabled: true,
      field: "email",
      operator: "is_not_empty",
      value: null,
      points: 8,
    },
    {
      id: id(),
      label: "High follow-up priority",
      enabled: true,
      field: "followupPriority",
      operator: "equals",
      value: "High",
      points: 12,
    },
    {
      id: id(),
      label: "Disengaged penalty",
      enabled: true,
      field: "isDisengaged",
      operator: "is_true",
      value: true,
      points: -25,
    },
  ];
}
