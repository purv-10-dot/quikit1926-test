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
  // Sub Status is a real standard column (QcfLead.substatus, nullable). It is
  // driven by the status->substatus cascade in the lead form (visibleSubstatuses),
  // so it is intentionally listed here WITHOUT static options. Its purpose in this
  // array is to (a) surface a "Sub Status" target in the CSV import mapper and
  // (b) reserve the `substatus` key in STANDARD_KEYS. The hardcoded lead form
  // renders substatus via its own props, so this does NOT add a duplicate field.
  { key: "substatus", label: "Sub Status", fieldType: "Select", requirement: "Optional", visible: true, isStandard: true },
  // Lead Quality is a real standard column (QcfLead.leadQuality, nullable). It
  // was present in IMPORTABLE_STANDARD_KEYS (backend allows importing it) but was
  // MISSING from this array — so the CSV import mapper never offered it (the
  // mapper lists STANDARD_LEAD_FIELDS ∩ IMPORTABLE_STANDARD_KEYS), the value was
  // never written, the column stayed empty, and the advanced filter's
  // "Lead quality is Hot" matched zero rows. Added as Text (no static options):
  // like `source`, the real values come from the data — the advanced-filter
  // value picker resolves leadQuality via capped DB-distinct (see field-values.ts
  // REAL_COLUMN_DISTINCT), so it shows the client's ACTUAL quality values rather
  // than a hardcoded Hot/Warm/Cold guess that may not match their vocabulary.
  { key: "leadQuality", label: "Lead quality", fieldType: "Text", requirement: "Optional", visible: true, isStandard: true },
  // Country is a real standard column (QcfLead.country, nullable). Like
  // leadQuality it was in IMPORTABLE_STANDARD_KEYS but MISSING from this array,
  // so the CSV import mapper never offered it and country could not be imported
  // at all (client leads would arrive with no country). Added here so it surfaces
  // as a mapping target. The lead form already renders country via its dedicated
  // address section (LeadAddressSection / setCountry), NOT from this array, so
  // this does NOT create a duplicate country input — same pattern as substatus.
  { key: "country", label: "Country", fieldType: "Text", requirement: "Optional", visible: true, isStandard: true },
  { key: "score",     label: "Score",      fieldType: "Number", requirement: "System",   visible: true, isStandard: true, showInList: true },
  { key: "ownerName", label: "Owner",      fieldType: "Text",   requirement: "Optional", visible: true, isStandard: true, showInList: true },
];

export const STANDARD_KEYS = new Set(STANDARD_LEAD_FIELDS.map((f) => f.key));

/** Validate a field key is a safe JSON-property identifier and not colliding with a standard field. */
export function isValidFieldKey(key: string): boolean {
  return /^[a-z][a-zA-Z0-9_]{0,40}$/.test(key);
}
