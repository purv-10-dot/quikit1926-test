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
  /**
   * Whether this standard field is actually rendered in the Add Lead form
   * (`components/leads/lead-form-view.tsx`). The settings "Standard fields"
   * list shows ONLY flagged fields so it stays in sync with the form.
   *
   * Single source of truth: when a standard field is added to / removed from
   * the form, flip this flag here — the settings page updates automatically.
   * Requirement-only fields (topic, technology, budget, etc.) that live in
   * `requirementDetails` rather than the main form leave this unset.
   */
  inLeadForm?: boolean;
}

/**
 * Standard fields ship with every org. They mirror the columns that exist
 * directly on the Lead Prisma model. Users can hide them but not delete them.
 *
 * Keys here MUST match Lead column names so the LeadForm can write straight
 * through to the Lead row (not into dynamicFields).
 */
export const STANDARD_LEAD_FIELDS: LeadFieldDefinition[] = [
  { key: "name",      label: "Lead Name",  fieldType: "Text",   requirement: "Required", visible: true, isStandard: true, showInList: true, inLeadForm: true },
  { key: "email",     label: "Email",      fieldType: "Email",  requirement: "Optional", visible: true, isStandard: true, showInList: true, inLeadForm: true },
  { key: "phone",     label: "Phone",      fieldType: "Phone",  requirement: "Optional", visible: true, isStandard: true, showInList: true, inLeadForm: true },
  { key: "mobile",    label: "Mobile",     fieldType: "Phone",  requirement: "Optional", visible: true, isStandard: true, inLeadForm: true },
  { key: "company",   label: "Company",    fieldType: "Text",   requirement: "Optional", visible: true, isStandard: true, showInList: true, inLeadForm: true },
  { key: "jobTitle",  label: "Job title",  fieldType: "Text",   requirement: "Optional", visible: true, isStandard: true, inLeadForm: true },
  { key: "industry",  label: "Industry",   fieldType: "Text",   requirement: "Optional", visible: true, isStandard: true, inLeadForm: true },
  { key: "secondaryEmail", label: "Secondary email", fieldType: "Email", requirement: "Optional", visible: true, isStandard: true, inLeadForm: true },
  { key: "website",   label: "Website",    fieldType: "Text",   requirement: "Optional", visible: true, isStandard: true, inLeadForm: true },
  { key: "linkedinUrl", label: "LinkedIn URL", fieldType: "Text", requirement: "Optional", visible: true, isStandard: true, inLeadForm: true },
  { key: "annualRevenueDisplay", label: "Annual revenue", fieldType: "Text", requirement: "Optional", visible: true, isStandard: true, inLeadForm: true },
  // Requirement-only fields — stored in requirementDetails (keyed by lead type),
  // not rendered in the main Add Lead form. No `inLeadForm` flag → hidden from
  // the settings Standard fields list.
  { key: "descriptionInformation", label: "Description / Notes", fieldType: "TextArea", requirement: "Optional", visible: true, isStandard: true },
  { key: "topic", label: "Topic", fieldType: "Text", requirement: "Required", visible: true, isStandard: true },
  { key: "technology", label: "Technology", fieldType: "MultiSelect", requirement: "Required", visible: true, isStandard: true, options: [...["Cloud", "AI / ML", "Cybersecurity", "ERP", "CRM", "Data & Analytics", "IoT", "Mobile", "Web Development", "DevOps", "SAP", "Microsoft", "Salesforce", "Networking", "Other"]] },
  { key: "budgetAmount", label: "Budget amount", fieldType: "Number", requirement: "Optional", visible: true, isStandard: true },
  { key: "purchaseTimeframe", label: "Purchase timeframe", fieldType: "Select", requirement: "Optional", visible: true, isStandard: true, options: ["Immediate", "This Quarter", "Next Quarter", "This Year", "Unknown"] },
  { key: "source",    label: "Source",     fieldType: "Text",   requirement: "Optional", visible: true, isStandard: true, inLeadForm: true },
  { key: "stage",     label: "Stage",      fieldType: "Select", requirement: "Required", visible: true, isStandard: true, showInList: true, inLeadForm: true,
    options: ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Closed"] },
  { key: "status",    label: "Status",     fieldType: "Select", requirement: "Required", visible: true, isStandard: true, showInList: true, inLeadForm: true,
    options: ["Open", "Working", "Disqualified", "Converted"] },
  { key: "score",     label: "Score",      fieldType: "Number", requirement: "System",   visible: true, isStandard: true, showInList: true, inLeadForm: true },
  { key: "ownerName", label: "Owner",      fieldType: "Text",   requirement: "Optional", visible: true, isStandard: true, showInList: true, inLeadForm: true },
];

/**
 * System fields are auto-managed top-level Lead columns that are NOT user-editable
 * and never appear in the Add Lead form (so they carry no `inLeadForm` flag and
 * stay out of the Settings "Standard fields" list). They ARE selectable, sortable
 * grid columns — surfaced in the Leads table and the Column picker / Hide-columns
 * list. Keys must match Lead column names so the leads API can select + sort them.
 */
export const SYSTEM_LEAD_FIELDS: LeadFieldDefinition[] = [
  { key: "createdAt", label: "Created Date", fieldType: "Date", requirement: "System", visible: true, isStandard: true, showInList: true },
];

/** Standard + system field keys — reserved (cannot be used by a custom field). */
export const STANDARD_KEYS = new Set(
  [...STANDARD_LEAD_FIELDS, ...SYSTEM_LEAD_FIELDS].map((f) => f.key),
);

/** Keys of system fields — used to gate grid sorting / rendering separately from form fields. */
export const SYSTEM_KEYS = new Set(SYSTEM_LEAD_FIELDS.map((f) => f.key));

/** Validate a field key is a safe JSON-property identifier and not colliding with a standard field. */
export function isValidFieldKey(key: string): boolean {
  return /^[a-z][a-zA-Z0-9_]{0,40}$/.test(key);
}
