/** Metadata for the rule-builder field dropdown. */

export type LeadScoringFieldType = "string" | "number" | "boolean";

export interface LeadScoringFieldDef {
  key: string;
  label: string;
  type: LeadScoringFieldType;
}

export const LEAD_SCORING_FIELD_DEFS: LeadScoringFieldDef[] = [
  { key: "source", label: "Source", type: "string" },
  { key: "stage", label: "Stage", type: "string" },
  { key: "status", label: "Status", type: "string" },
  { key: "substatus", label: "Sub-status", type: "string" },
  { key: "industry", label: "Industry", type: "string" },
  { key: "country", label: "Country", type: "string" },
  { key: "leadQuality", label: "Lead quality", type: "string" },
  { key: "followupPriority", label: "Follow-up priority", type: "string" },
  { key: "company", label: "Company", type: "string" },
  { key: "jobTitle", label: "Job title", type: "string" },
  { key: "email", label: "Email", type: "string" },
  { key: "phone", label: "Phone", type: "string" },
  { key: "mobile", label: "Mobile", type: "string" },
  { key: "website", label: "Website", type: "string" },
  { key: "linkedinUrl", label: "LinkedIn URL", type: "string" },
  { key: "isStarred", label: "Starred", type: "boolean" },
  { key: "isDisengaged", label: "Disengaged", type: "boolean" },
];

export const STRING_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "in",
  "not_in",
  "is_empty",
  "is_not_empty",
] as const;

export const BOOLEAN_OPERATORS = ["is_true", "is_false"] as const;

export function operatorsForField(fieldKey: string): readonly string[] {
  if (fieldKey.startsWith("dynamicFields.")) return STRING_OPERATORS;
  const def = LEAD_SCORING_FIELD_DEFS.find((f) => f.key === fieldKey);
  if (!def) return STRING_OPERATORS;
  if (def.type === "boolean") return BOOLEAN_OPERATORS;
  return STRING_OPERATORS;
}
