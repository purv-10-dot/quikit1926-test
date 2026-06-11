import { LEAD_TECHNOLOGY_OPTIONS } from "@/lib/leads/lead-qualification-options";

export const LEAD_TYPE_OPTIONS = [
  "Fixed Project",
  "T&M Project",
  "Support",
  "Dedicated Resource Sharing",
] as const;

export type LeadTypeOption = (typeof LEAD_TYPE_OPTIONS)[number];

export const STATUS_OF_ROUNDS_OPTIONS = [
  "Screening",
  "First Round",
  "Second Round",
  "Final Round",
] as const;

export type RequirementFieldKind = "text" | "textarea" | "number" | "technology" | "select";

export interface RequirementFieldDef {
  key: string;
  label: string;
  kind: RequirementFieldKind;
  required?: boolean;
  options?: readonly string[];
  placeholder?: string;
}

const COMMON_TECH: RequirementFieldDef = {
  key: "technology",
  label: "Technology",
  kind: "technology",
  required: true,
};

const COMMON_COMMENTS: RequirementFieldDef = {
  key: "comments",
  label: "Comments",
  kind: "textarea",
  placeholder: "Additional context for this requirement…",
};

const COMMON_CONTRACT: RequirementFieldDef = {
  key: "contractAttachment",
  label: "Contract Attachment",
  kind: "text",
  placeholder: "File name or link (upload from lead detail after save)",
};

export const REQUIREMENT_FIELDS_BY_TYPE: Record<LeadTypeOption, RequirementFieldDef[]> = {
  "Dedicated Resource Sharing": [
    COMMON_TECH,
    { key: "profile", label: "Profile", kind: "text", required: true },
    { key: "jdClientJd", label: "JD / Client JD", kind: "textarea", required: true },
    { key: "reqBudget", label: "Budget", kind: "text" },
    { key: "duration", label: "Duration", kind: "text" },
    { key: "profilesShared", label: "Profiles Shared", kind: "text" },
    {
      key: "statusOfRounds",
      label: "Status of Rounds",
      kind: "select",
      options: STATUS_OF_ROUNDS_OPTIONS,
    },
    COMMON_COMMENTS,
    COMMON_CONTRACT,
  ],
  "T&M Project": [
    COMMON_TECH,
    { key: "fixedHours", label: "Fixed Hours", kind: "number" },
    { key: "hourlyCost", label: "Hourly Cost", kind: "number" },
    { key: "duration", label: "Duration", kind: "text" },
    COMMON_COMMENTS,
    COMMON_CONTRACT,
  ],
  "Fixed Project": [
    COMMON_TECH,
    { key: "projectTitle", label: "Project Title", kind: "text", required: true },
    { key: "projectDescription", label: "Project Description", kind: "textarea", required: true },
    { key: "projectDuration", label: "Project Duration", kind: "text" },
    { key: "projectCost", label: "Project Cost", kind: "number" },
    COMMON_COMMENTS,
    COMMON_CONTRACT,
  ],
  Support: [
    COMMON_TECH,
    { key: "fixedHours", label: "Fixed Hours", kind: "number" },
    { key: "hourlyCost", label: "Hourly Cost", kind: "number" },
    { key: "duration", label: "Duration", kind: "text" },
    {
      key: "supportTerms",
      label: "Support Terms & Conditions",
      kind: "textarea",
    },
    COMMON_COMMENTS,
    COMMON_CONTRACT,
  ],
};

export type RequirementDetails = Record<string, unknown>;

export function isLeadTypeOption(value: string): value is LeadTypeOption {
  return (LEAD_TYPE_OPTIONS as readonly string[]).includes(value);
}

export function parseRequirementDetails(raw: unknown): RequirementDetails {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return { ...(raw as RequirementDetails) };
}

export function parseRequirementTechnology(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

export function getRequirementFields(leadType: string): RequirementFieldDef[] {
  if (!isLeadTypeOption(leadType)) return [];
  return REQUIREMENT_FIELDS_BY_TYPE[leadType];
}

export function validateRequirementDetails(
  leadType: string,
  details: RequirementDetails,
): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!isLeadTypeOption(leadType)) {
    errs.leadType = "Type of lead is required";
    return errs;
  }

  for (const field of REQUIREMENT_FIELDS_BY_TYPE[leadType]) {
    const value = details[field.key];
    if (field.kind === "technology") {
      const tech = parseRequirementTechnology(value);
      if (field.required && tech.length === 0) {
        errs[`req.${field.key}`] = "Select at least one technology";
      }
      continue;
    }
    if (!field.required) continue;
    const empty =
      value == null ||
      value === "" ||
      (typeof value === "string" && !value.trim());
    if (empty) errs[`req.${field.key}`] = `${field.label} is required`;
  }
  return errs;
}

export { LEAD_TECHNOLOGY_OPTIONS };

export function cleanRequirementDetails(details: RequirementDetails): RequirementDetails {
  const out: RequirementDetails = {};
  for (const [k, v] of Object.entries(details)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}
