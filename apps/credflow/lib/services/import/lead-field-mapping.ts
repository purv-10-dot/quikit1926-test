/**
 * CSV-column → Lead-field resolution for imports.
 *
 * The Lead form is NOT a fixed set of columns — admins add/rename/remove custom
 * fields at any time. This resolver reads the org's LIVE field definitions
 * (listLeadFields) so a field added tomorrow is importable with zero code
 * changes. It supports an explicit column map from the mapping UI, and falls
 * back to header↔key/label matching for plain CSV uploads.
 */
import { STANDARD_KEYS, type LeadFieldDefinition } from "@/types/field-definition";

/**
 * Standard Lead-form keys that are genuine scalar columns on CrmLead and safe to
 * write straight through on import. Deliberately EXCLUDES form-only or
 * collected-but-stripped keys (firstName, lastName, topic, technology, leadType,
 * score, …) that are not Lead columns — writing those to prisma.crmLead.create
 * would throw "Unknown argument". Custom (dynamic) fields go to Lead.dynamicFields
 * instead and never appear here.
 */
export const IMPORTABLE_STANDARD_KEYS: ReadonlySet<string> = new Set([
  "name", "email", "phone", "mobile", "company", "jobTitle", "industry",
  "secondaryEmail", "website", "linkedinUrl", "annualRevenueDisplay",
  "descriptionInformation", "source", "stage", "status", "substatus",
  "leadQuality", "country", "ownerName", "externalId", "sourceSystem",
]);

export interface ResolvedImportRow {
  /** Importable standard Lead columns (string values). Includes `name` when mapped. */
  standard: Record<string, string>;
  /** Raw custom-field inputs keyed by field key — feed to validateDynamicFields. */
  dynamicInput: Record<string, unknown>;
}

/**
 * Map one parsed CSV row to lead fields.
 *
 * - When `columnMap` (csvHeader → fieldKey) is provided (from the mapping UI), it wins.
 * - Otherwise headers are matched case-insensitively against each field's key AND
 *   label, so a plain CSV whose headers match field keys/labels just works.
 *
 * Keys are resolved against the org's live `defs`, so newly-added fields are
 * supported automatically. Unknown / non-importable columns are ignored.
 */
export function resolveImportRow(
  row: Record<string, string>,
  columnMap: Record<string, string> | null | undefined,
  defs: LeadFieldDefinition[],
): ResolvedImportRow {
  const customByKey = new Map<string, LeadFieldDefinition>(
    defs.filter((d) => !d.isStandard && !STANDARD_KEYS.has(d.key)).map((d) => [d.key, d]),
  );

  const headerToKey = new Map<string, string>();
  if (!columnMap) {
    for (const d of defs) {
      headerToKey.set(d.key.toLowerCase(), d.key);
      if (d.label) headerToKey.set(d.label.trim().toLowerCase(), d.key);
    }
  }

  const standard: Record<string, string> = {};
  const dynamicInput: Record<string, unknown> = {};

  for (const [header, rawValue] of Object.entries(row)) {
    const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (value === undefined || value === null || value === "") continue;

    const key = columnMap ? columnMap[header] : headerToKey.get(header.trim().toLowerCase());
    if (!key) continue;

    if (IMPORTABLE_STANDARD_KEYS.has(key)) {
      standard[key] = String(value);
    } else {
      const def = customByKey.get(key);
      if (!def) continue; // non-importable standard (e.g. score) or unknown key
      // MultiSelect CSV cells are a single string; split on ; or | (comma is the CSV delimiter).
      dynamicInput[key] =
        def.fieldType === "MultiSelect"
          ? String(value).split(/[;|]/).map((s) => s.trim()).filter(Boolean)
          : value;
    }
  }

  return { standard, dynamicInput };
}
