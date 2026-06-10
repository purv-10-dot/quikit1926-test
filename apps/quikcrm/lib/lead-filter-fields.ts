/**
 * Filterable fields for the Lead module — same set the legacy advanced filter
 * modal exposed (quikcrm-frontend/src/config/filterFields.ts).
 *
 * Server-side validation in /api/leads/filter rejects any field not on this list,
 * so adding a new filter requires updating BOTH this catalog AND the
 * translateConditionsToPrisma() switch in src/lib/services/leads/filter-engine.ts.
 */

import type { FilterFieldDef } from "@/types/lead-filter";

const STAGE_OPTIONS = [
  { value: "New", label: "New" },
  { value: "Contacted", label: "Contacted" },
  { value: "Qualified", label: "Qualified" },
  { value: "Proposal", label: "Proposal" },
  { value: "Negotiation", label: "Negotiation" },
  { value: "Closed", label: "Closed" },
];

const STATUS_OPTIONS = [
  { value: "Open", label: "Open" },
  { value: "Working", label: "Working" },
  { value: "Disqualified", label: "Disqualified" },
  { value: "Converted", label: "Converted" },
];

export const LEAD_FILTER_FIELDS: FilterFieldDef[] = [
  { field: "name", label: "Lead Name", type: "text" },
  { field: "email", label: "Email", type: "text" },
  { field: "phone", label: "Phone", type: "text" },
  { field: "mobile", label: "Mobile", type: "text" },
  { field: "company", label: "Company", type: "text" },
  { field: "jobTitle", label: "Job title", type: "text" },
  { field: "source", label: "Source", type: "text" },
  { field: "stage", label: "Stage", type: "select", options: STAGE_OPTIONS },
  { field: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
  { field: "score", label: "Score", type: "number" },
  { field: "ownerName", label: "Owner", type: "text" },
  { field: "country", label: "Country", type: "text" },
  { field: "addressLine1", label: "Street address", type: "text" },
  { field: "addressLine2", label: "Flat / building", type: "text" },
  { field: "cityName", label: "City", type: "text" },
  { field: "stateName", label: "State", type: "text" },
  { field: "postalCode", label: "Postal code", type: "text" },
  { field: "industry", label: "Industry", type: "text" },
  { field: "secondaryEmail", label: "Secondary email", type: "text" },
  { field: "website", label: "Website", type: "text" },
  { field: "linkedinUrl", label: "LinkedIn URL", type: "text" },
  { field: "annualRevenueDisplay", label: "Annual revenue", type: "text" },
  { field: "leadQuality", label: "Lead quality", type: "text" },
  { field: "isStarred", label: "Starred", type: "boolean" },
  { field: "isDisengaged", label: "Disengaged", type: "boolean" },
  { field: "createdAt", label: "Created", type: "date" },
  { field: "updatedAt", label: "Updated", type: "date" },
  { field: "convertedAt", label: "Converted", type: "date" },
];

export const LEAD_FILTER_FIELD_NAMES = new Set(LEAD_FILTER_FIELDS.map((f) => f.field));

export function getFilterField(name: string): FilterFieldDef | undefined {
  return LEAD_FILTER_FIELDS.find((f) => f.field === name);
}

/** Standard catalog first, then org custom fields (advanced filter modal). */
export function resolveLeadFilterField(
  name: string,
  extraFields: FilterFieldDef[] = [],
): FilterFieldDef | undefined {
  return getFilterField(name) ?? extraFields.find((f) => f.field === name);
}
