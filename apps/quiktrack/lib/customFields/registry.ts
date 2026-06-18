/**
 * Custom Fields — type registry (framework-agnostic).
 *
 * Single source of truth for the 10 field types from the Customer Fields FRD.
 * Server (API/service) and client (forms/filters) both import from here so the
 * storage column, accepted value shape, and filter operators never drift.
 *
 * Storage lives in QtIssueFieldValue with typed columns (valueText/Number/
 * Date/Boolean/Json) — see schema.prisma. `toColumns`/`fromColumns` translate
 * between a logical field value and those columns.
 */

export const FIELD_TYPES = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "NUMBER",
  "DATE",
  "DROPDOWN_SINGLE",
  "DROPDOWN_MULTI",
  "CHECKBOX",
  "URL",
  "USER_PICKER",
  "LABELS",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export function isFieldType(s: string): s is FieldType {
  return (FIELD_TYPES as readonly string[]).includes(s);
}

/** Which UI control renders the field (maps to a component in field-control.tsx). */
export type ControlKind =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "multiselect"
  | "checkbox"
  | "url"
  | "user"
  | "labels";

/** Filter operators a type exposes in the Backlog/Board filter panel (FRD §4). */
export type FilterOperator =
  | "contains"
  | "equals"
  | "is_empty"
  | "is_not_empty"
  | "eq"
  | "neq"
  | "lt"
  | "gt"
  | "between"
  | "before"
  | "after"
  | "in"
  | "not_in"
  | "has_any"
  | "has_all"
  | "is_true"
  | "is_false"
  | "is"
  | "is_not";

/** The columns of QtIssueFieldValue we write to (partial). */
export interface ValueColumns {
  valueText?: string | null;
  valueNumber?: number | null;
  valueDate?: Date | null;
  valueBoolean?: boolean | null;
  valueJson?: unknown;
}

/** Logical value as exchanged over the API / used in forms. */
export type FieldValue = string | number | boolean | string[] | null;

interface FieldTypeConfig {
  type: FieldType;
  label: string;
  control: ControlKind;
  /** Dropdown types own a set of QtCustomFieldOption rows. */
  hasOptions: boolean;
  /** Value is an array (multi-select / labels) → stored in valueJson. */
  isMulti: boolean;
  operators: FilterOperator[];
  /** Serialize a logical value into QtIssueFieldValue columns (clears the rest). */
  toColumns: (value: FieldValue) => ValueColumns;
  /** Read a logical value back out of a QtIssueFieldValue row. */
  fromColumns: (row: ValueColumns) => FieldValue;
}

const EMPTY_COLUMNS: Required<ValueColumns> = {
  valueText: null,
  valueNumber: null,
  valueDate: null,
  valueBoolean: null,
  valueJson: null,
};

/** Treat "" / null / undefined / [] as "no value". */
export function isBlank(value: FieldValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

const textType = (type: FieldType, label: string, control: ControlKind): FieldTypeConfig => ({
  type,
  label,
  control,
  hasOptions: false,
  isMulti: false,
  operators: ["contains", "equals", "is_empty"],
  toColumns: (v) => ({ ...EMPTY_COLUMNS, valueText: isBlank(v) ? null : String(v) }),
  fromColumns: (row) => row.valueText ?? null,
});

const arrayType = (type: FieldType, label: string, control: ControlKind, operators: FilterOperator[]): FieldTypeConfig => ({
  type,
  label,
  control,
  hasOptions: type === "DROPDOWN_MULTI",
  isMulti: true,
  operators,
  toColumns: (v) => ({
    ...EMPTY_COLUMNS,
    valueJson: Array.isArray(v) && v.length > 0 ? v : null,
  }),
  fromColumns: (row) => (Array.isArray(row.valueJson) ? (row.valueJson as string[]) : []),
});

export const FIELD_REGISTRY: Record<FieldType, FieldTypeConfig> = {
  SHORT_TEXT: textType("SHORT_TEXT", "Short text", "text"),
  LONG_TEXT: textType("LONG_TEXT", "Long text", "textarea"),
  URL: {
    ...textType("URL", "URL", "url"),
    operators: ["contains", "equals", "is_empty"],
  },
  USER_PICKER: {
    ...textType("USER_PICKER", "User picker", "user"),
    operators: ["is", "is_not", "is_empty"],
  },
  DROPDOWN_SINGLE: {
    type: "DROPDOWN_SINGLE",
    label: "Dropdown (single)",
    control: "select",
    hasOptions: true,
    isMulti: false,
    operators: ["in", "not_in", "is_empty"],
    toColumns: (v) => ({ ...EMPTY_COLUMNS, valueText: isBlank(v) ? null : String(v) }),
    fromColumns: (row) => row.valueText ?? null,
  },
  NUMBER: {
    type: "NUMBER",
    label: "Number",
    control: "number",
    hasOptions: false,
    isMulti: false,
    operators: ["eq", "neq", "lt", "gt", "between", "is_empty"],
    toColumns: (v) => ({ ...EMPTY_COLUMNS, valueNumber: isBlank(v) ? null : Number(v) }),
    fromColumns: (row) => (row.valueNumber ?? null),
  },
  DATE: {
    type: "DATE",
    label: "Date",
    control: "date",
    hasOptions: false,
    isMulti: false,
    operators: ["eq", "before", "after", "between", "is_empty"],
    toColumns: (v) => ({
      ...EMPTY_COLUMNS,
      valueDate: isBlank(v) ? null : new Date(String(v)),
    }),
    // Return ISO date (yyyy-mm-dd) for the form/date input.
    fromColumns: (row) =>
      row.valueDate ? new Date(row.valueDate).toISOString().slice(0, 10) : null,
  },
  CHECKBOX: {
    type: "CHECKBOX",
    label: "Checkbox",
    control: "checkbox",
    hasOptions: false,
    isMulti: false,
    operators: ["is_true", "is_false", "is_empty"],
    toColumns: (v) => ({ ...EMPTY_COLUMNS, valueBoolean: v === null || v === undefined ? null : Boolean(v) }),
    fromColumns: (row) => (typeof row.valueBoolean === "boolean" ? row.valueBoolean : null),
  },
  DROPDOWN_MULTI: arrayType("DROPDOWN_MULTI", "Dropdown (multi)", "multiselect", ["has_any", "has_all", "not_in"]),
  LABELS: arrayType("LABELS", "Labels", "labels", ["has_any", "not_in"]),
};

export function fieldConfig(type: string): FieldTypeConfig {
  if (!isFieldType(type)) throw new Error(`Unknown custom field type: ${type}`);
  return FIELD_REGISTRY[type];
}

/** Convenience list for the "Field type" dropdown in the admin UI. */
export const FIELD_TYPE_OPTIONS = FIELD_TYPES.map((t) => ({
  value: t,
  label: FIELD_REGISTRY[t].label,
}));

/** Generate the immutable field key from a name, e.g. "Customer Tier" → "customer_tier". */
export function generateFieldKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "field";
}
