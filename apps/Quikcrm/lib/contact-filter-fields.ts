import type { FilterFieldDef } from "@/types/lead-filter";

const STAGE_OPTIONS = [
  { value: "New Lead", label: "New Lead" },
  { value: "Contacted", label: "Contacted" },
  { value: "Qualified", label: "Qualified" },
  { value: "Proposal", label: "Proposal" },
  { value: "Won", label: "Won" },
  { value: "Lost", label: "Lost" },
];

const SOURCE_OPTIONS = [
  { value: "Web", label: "Web" },
  { value: "Referral", label: "Referral" },
  { value: "Campaign", label: "Campaign" },
  { value: "Manual", label: "Manual" },
];

export const CONTACT_FILTER_FIELDS: FilterFieldDef[] = [
  { field: "firstName", label: "First name", type: "text" },
  { field: "lastName", label: "Last name", type: "text" },
  { field: "email", label: "Email", type: "text" },
  { field: "phone", label: "Phone", type: "text" },
  { field: "title", label: "Title", type: "text" },
  { field: "ownerName", label: "Owner", type: "text" },
  { field: "ownerId", label: "Owner ID", type: "text" },
  { field: "accountId", label: "Account ID", type: "text" },
  { field: "city", label: "City", type: "text" },
  { field: "contactStage", label: "Stage", type: "select", options: STAGE_OPTIONS },
  { field: "source", label: "Source", type: "select", options: SOURCE_OPTIONS },
  { field: "createdAt", label: "Created", type: "date" },
  { field: "updatedAt", label: "Updated", type: "date" },
];

export const CONTACT_FILTER_FIELD_NAMES = new Set(
  CONTACT_FILTER_FIELDS.map((f) => f.field),
);

export function getContactFilterField(name: string): FilterFieldDef | undefined {
  return CONTACT_FILTER_FIELDS.find((f) => f.field === name);
}
