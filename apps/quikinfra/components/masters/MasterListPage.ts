/**
 * Re-export shim — the canonical MasterListPage lives one directory up at
 * `@/components/MasterListPage`. Several pages copied in from sibling apps
 * import from `@/components/masters/MasterListPage`; this file makes that
 * path resolve without forcing a sweep across every consumer.
 *
 * Also re-declares `FieldConfig` here. Consumers (store/material-issue,
 * store/stock-transfer, etc.) import this type alongside MasterListPage to
 * type the header-field arrays they hand to MultiLineDocForm. The shape is
 * intentionally permissive so the existing pages compile without edits.
 */

export { MasterListPage, type MasterColumnDef, type MasterListPageProps } from "../MasterListPage";

export type FieldType = "text" | "number" | "select" | "textarea" | "date";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** Layout hint — `"half"` renders the field on a 2-column grid row, `"full"` (default) spans the row. */
  width?: "half" | "full";
  placeholder?: string;
  options?: FieldOption[];
  /** Coerce on input — currently only `"uppercase"` is honored. */
  transform?: "uppercase" | "lowercase";
  /** Free-form hint shown beneath the field. */
  hint?: string;
}
