import type { FilterFieldDef } from "@/types/lead-filter";

const RELATED_KIND_OPTIONS = [
  { value: "Lead", label: "Lead" },
  { value: "Opportunity", label: "Opportunity" },
  { value: "Contact", label: "Contact" },
  { value: "Account", label: "Account" },
];

export const ACTIVITY_FILTER_FIELDS: FilterFieldDef[] = [
  { field: "type", label: "Type", type: "text" },
  { field: "relatedKind", label: "Related kind", type: "select", options: RELATED_KIND_OPTIONS },
  { field: "relatedObjectId", label: "Related ID", type: "text" },
  { field: "subject", label: "Subject", type: "text" },
  { field: "outcome", label: "Outcome", type: "text" },
  { field: "ownerName", label: "Owner", type: "text" },
  { field: "ownerId", label: "Owner ID", type: "text" },
  { field: "activityCode", label: "Activity code", type: "text" },
  { field: "logOutcome", label: "Log outcome", type: "text" },
  { field: "detailNotes", label: "Notes", type: "text" },
  { field: "occurredAt", label: "Occurred", type: "date" },
  { field: "createdAt", label: "Created", type: "date" },
  // Outreach JSON paths (translated specially in filter-engine)
  { field: "outreach.disposition", label: "Outreach disposition", type: "text" },
  { field: "outreach.channel", label: "Outreach channel", type: "text" },
  { field: "outreach.country", label: "Outreach country", type: "text" },
];

export const ACTIVITY_FILTER_FIELD_NAMES = new Set(
  ACTIVITY_FILTER_FIELDS.map((f) => f.field),
);

export function getActivityFilterField(name: string): FilterFieldDef | undefined {
  return ACTIVITY_FILTER_FIELDS.find((f) => f.field === name);
}
