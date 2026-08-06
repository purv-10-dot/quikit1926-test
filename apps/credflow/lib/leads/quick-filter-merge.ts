import type { ConditionRow, FilterPayload } from "@/types/lead-filter";

function withQuickFilter(
  filter: FilterPayload,
  field: string,
  value: string,
  operator: ConditionRow["operator"],
): FilterPayload {
  if (!value) return filter;
  const stripped = filter.conditions.filter((c) => c.field !== field);
  return { ...filter, matchMode: "ALL", conditions: [...stripped, { field, operator, value }] };
}

export interface LeadQuickFilterInputs {
  search: string;
  stage: string;
  ownerName: string;
  mineOnly: boolean;
  mineOwnerName?: string;
}

/** Merge toolbar quick filters onto an advanced-filter payload for POST /api/leads/filter. */
export function mergeLeadQuickFilters(
  filter: FilterPayload,
  quick: LeadQuickFilterInputs,
): FilterPayload {
  let f = filter;
  // Text search is sent as `search` on the filter request body (multi-field OR).
  // Drop any advanced "name" condition so it does not AND with the toolbar query.
  if (quick.search.trim()) {
    f = { ...f, conditions: f.conditions.filter((c) => c.field !== "name") };
  }
  f = withQuickFilter(f, "stage", quick.stage, "eq");
  if (quick.mineOnly && quick.mineOwnerName) {
    f = withQuickFilter(f, "ownerName", quick.mineOwnerName, "eq");
  } else {
    f = withQuickFilter(f, "ownerName", quick.ownerName, "eq");
  }
  return f;
}
