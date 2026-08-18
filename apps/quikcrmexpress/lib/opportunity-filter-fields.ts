/**
 * Filterable fields for Opportunities — used by OpportunityAdvancedFilterModal.
 * Server enforcement: `lib/services/opportunities/filter-engine.ts`.
 */

import type { FilterFieldDef } from "@/types/lead-filter";
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/services/opportunities/stage-labels";

const STAGE_OPTIONS = STAGE_ORDER.map((stage) => ({
  value: stage,
  label: STAGE_LABEL[stage],
}));

const CURRENCY_OPTIONS = [
  { value: "INR", label: "INR" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
];

export const OPPORTUNITY_FILTER_FIELDS: FilterFieldDef[] = [
  { field: "name", label: "Opportunity name", type: "text" },
  { field: "accountName", label: "Account name", type: "text" },
  { field: "stage", label: "Stage", type: "select", options: STAGE_OPTIONS },
  { field: "ownerName", label: "Owner", type: "text" },
  { field: "amount", label: "Amount", type: "number" },
  { field: "probability", label: "Probability %", type: "number" },
  { field: "currency", label: "Currency", type: "select", options: CURRENCY_OPTIONS },
  { field: "weightedAmount", label: "Weighted amount", type: "number" },
  { field: "closeDate", label: "Close date", type: "date" },
  { field: "createdAt", label: "Created", type: "date" },
];

export function getOpportunityFilterField(name: string): FilterFieldDef | undefined {
  return OPPORTUNITY_FILTER_FIELDS.find((f) => f.field === name);
}
