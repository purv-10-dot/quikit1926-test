/**
 * Filterable fields for the Accounts module — surfaced inside
 * AccountAdvancedFilterModal. Server-side enforcement lives in
 * `lib/services/accounts/index.ts::ALLOWED_FILTER_FIELDS` — keep the two in
 * sync. Adding a field here without the server allow-list will silently drop
 * it from the WHERE clause.
 */

import type { FilterFieldDef } from "@/types/lead-filter";
import { ACCOUNT_LABEL_PRESETS } from "@/lib/accounts/account-labels";

const SEGMENT_OPTIONS = [
  { value: "Enterprise", label: "Enterprise" },
  { value: "MidMarket", label: "Mid-market" },
  { value: "SMB", label: "SMB" },
];

const STATUS_OPTIONS = [
  { value: "Active", label: "Active" },
  { value: "Prospect", label: "Prospect" },
  { value: "Inactive", label: "Inactive" },
];

export const ACCOUNT_FILTER_FIELDS: FilterFieldDef[] = [
  { field: "name", label: "Account name", type: "text" },
  { field: "segmentEnum", label: "Segment", type: "select", options: SEGMENT_OPTIONS },
  { field: "ownerName", label: "Owner", type: "text" },
  { field: "industry", label: "Industry", type: "text" },
  { field: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
  {
    field: "tags",
    label: "Label",
    type: "select",
    options: ACCOUNT_LABEL_PRESETS.map((v) => ({ value: v, label: v })),
  },
  { field: "annualRevenueAmount", label: "Annual revenue", type: "number" },
  { field: "city", label: "City", type: "text" },
  { field: "state", label: "State", type: "text" },
  { field: "countryCode", label: "Country code", type: "text" },
  { field: "healthScore", label: "Health score", type: "number" },
  { field: "npsScore", label: "NPS", type: "number" },
  { field: "renewalDate", label: "Renewal date", type: "date" },
  { field: "contractStart", label: "Contract start", type: "date" },
  { field: "contractEnd", label: "Contract end", type: "date" },
  { field: "createdAt", label: "Created", type: "date" },
  { field: "updatedAt", label: "Updated", type: "date" },
];

export function getAccountFilterField(name: string): FilterFieldDef | undefined {
  return ACCOUNT_FILTER_FIELDS.find((f) => f.field === name);
}
