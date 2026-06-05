/**
 * Lead field definitions — port of the legacy
 * OrgWorkspaceSettings.leadFieldDefinitions array on the NestJS backend.
 *
 * The values shape on Lead.dynamicFields is `{ [key]: <coerced-value> }`.
 */

export type FieldType =
  | "Text"
  | "TextArea"
  | "Number"
  | "Email"
  | "Phone"
  | "Date"
  | "Boolean"
  | "Select"
  | "MultiSelect";

export type FieldRequirement = "Required" | "Optional" | "System";

export interface LeadFieldDefinition {
  /** Stable, kebab-or-snake-case identifier. Used as the JSON key on Lead.dynamicFields. */
  key: string;
  label: string;
  fieldType: FieldType;
  requirement: FieldRequirement;
  /** Whether the field is visible in forms / detail. Hidden does NOT mean deleted. */
  visible: boolean;
  /** Optional default value. */
  defaultValue?: string | number | boolean | null;
  /** Optional helper text. */
  helpText?: string | null;
  /** Required for Select / MultiSelect; ignored otherwise. */
  options?: string[];
  /** Whether this is a built-in standard field (cannot be deleted, only edited). */
  isStandard?: boolean;
  /** Whether the field shows up by default as a column in the leads list. */
  showInList?: boolean;
}

/**
 * Standard fields ship with every org. They mirror the columns that exist
 * directly on the Lead Prisma model. Users can hide them but not delete them.
 *
 * Keys here MUST match Lead column names so the LeadForm can write straight
 * through to the Lead row (not into dynamicFields).
 */
export const STANDARD_LEAD_FIELDS: LeadFieldDefinition[] = [
  { key: "name",      label: "Lead Name",  fieldType: "Text",   requirement: "Required", visible: true, isStandard: true, showInList: true },
  { key: "email",     label: "Email",      fieldType: "Email",  requirement: "Optional", visible: true, isStandard: true, showInList: true },
  { key: "phone",     label: "Phone",      fieldType: "Phone",  requirement: "Optional", visible: true, isStandard: true, showInList: true },
  { key: "mobile",    label: "Mobile",     fieldType: "Phone",  requirement: "Optional", visible: true, isStandard: true },
  { key: "company",   label: "Company",    fieldType: "Text",   requirement: "Optional", visible: true, isStandard: true, showInList: true },
  { key: "jobTitle",  label: "Job title",  fieldType: "Text",   requirement: "Optional", visible: true, isStandard: true },
  { key: "industry",  label: "Industry",   fieldType: "Text",   requirement: "Optional", visible: true, isStandard: true },
  { key: "secondaryEmail", label: "Secondary email", fieldType: "Email", requirement: "Optional", visible: true, isStandard: true },
  { key: "website",   label: "Website",    fieldType: "Text",   requirement: "Optional", visible: true, isStandard: true },
  { key: "linkedinUrl", label: "LinkedIn URL", fieldType: "Text", requirement: "Optional", visible: true, isStandard: true },
  { key: "annualRevenueDisplay", label: "Annual revenue", fieldType: "Text", requirement: "Optional", visible: true, isStandard: true },
  { key: "descriptionInformation", label: "Description / Notes", fieldType: "TextArea", requirement: "Optional", visible: true, isStandard: true },
  { key: "topic", label: "Topic", fieldType: "Text", requirement: "Required", visible: true, isStandard: true },
  { key: "technology", label: "Technology", fieldType: "MultiSelect", requirement: "Required", visible: true, isStandard: true, options: [...["Cloud", "AI / ML", "Cybersecurity", "ERP", "CRM", "Data & Analytics", "IoT", "Mobile", "Web Development", "DevOps", "SAP", "Microsoft", "Salesforce", "Networking", "Other"]] },
  { key: "budgetAmount", label: "Budget amount", fieldType: "Number", requirement: "Optional", visible: true, isStandard: true },
  { key: "purchaseTimeframe", label: "Purchase timeframe", fieldType: "Select", requirement: "Optional", visible: true, isStandard: true, options: ["Immediate", "This Quarter", "Next Quarter", "This Year", "Unknown"] },
  { key: "source",    label: "Source",     fieldType: "Text",   requirement: "Optional", visible: true, isStandard: true },
  { key: "stage",     label: "Stage",      fieldType: "Select", requirement: "Required", visible: true, isStandard: true, showInList: true,
    options: ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Closed"] },
  { key: "status",    label: "Status",     fieldType: "Select", requirement: "Required", visible: true, isStandard: true, showInList: true,
    options: ["Open", "Working", "Disqualified", "Converted"] },
  { key: "score",     label: "Score",      fieldType: "Number", requirement: "System",   visible: true, isStandard: true, showInList: true },
  { key: "ownerName", label: "Owner",      fieldType: "Text",   requirement: "Optional", visible: true, isStandard: true, showInList: true },
];

export const STANDARD_KEYS = new Set(STANDARD_LEAD_FIELDS.map((f) => f.key));

/** Validate a field key is a safe JSON-property identifier and not colliding with a standard field. */
export function isValidFieldKey(key: string): boolean {
  return /^[a-z][a-zA-Z0-9_]{0,40}$/.test(key);
}
