/**
 * Filter DSL — legacy-compatible.
 * Mirrors the shape of quikcrm-frontend/src/store/slices/advancedFilterSlice.ts
 * so saved views are interchangeable between systems if migrated later.
 */

export type FilterOperator =
  // text
  | "eq"
  | "neq"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "isEmpty"
  | "isNotEmpty"
  // number
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  // date (UI) — translated to gt/lt of ISO date on the server
  | "before"
  | "after"
  | "on"
  // relative date (UI) — resolved to an inclusive IST {gte,lte} range on the server
  | "relToday"
  | "relYesterday"
  | "relTomorrow"
  | "relThisWeek"
  | "relLastWeek"
  | "relNextWeek"
  | "relThisMonth"
  | "relLastMonth"
  | "relThisYear"
  | "relLastYear"
  | "relLastNDays"
  | "relNextNDays"
  // collection
  | "in"
  | "notIn"
  // boolean
  | "isTrue"
  | "isFalse";

export type FilterValue = string | number | boolean | null | string[] | number[];

export interface ConditionRow {
  field: string;
  operator: FilterOperator;
  value?: FilterValue;
  /** Used only by `between`. */
  valueTo?: string | number | null;
}

export type MatchMode = "ALL" | "ANY";

export interface FilterPayload {
  matchMode: MatchMode;
  conditions: ConditionRow[];
}

export interface LeadSavedView {
  id: string;
  name: string;
  filter: FilterPayload;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export type FieldType = "text" | "number" | "date" | "select" | "boolean";

export interface FilterFieldDef {
  /** Server-side column name on the Lead model. */
  field: string;
  /** Human label shown in the modal. */
  label: string;
  type: FieldType;
  /** Operators supported for this field; if omitted, defaults are used per type. */
  operators?: FilterOperator[];
  /** Static option list for `select` fields. */
  options?: { value: string; label: string }[];
}

export const DEFAULT_OPERATORS: Record<FieldType, FilterOperator[]> = {
  text: ["contains", "eq", "neq", "notContains", "startsWith", "endsWith", "isEmpty", "isNotEmpty"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "between"],
  date: ["on", "before", "after", "between", "relToday", "relYesterday", "relTomorrow", "relThisWeek", "relLastWeek", "relNextWeek", "relThisMonth", "relLastMonth", "relThisYear", "relLastYear", "relLastNDays", "relNextNDays", "isEmpty", "isNotEmpty"],
  select: ["eq", "neq", "in", "notIn", "isEmpty", "isNotEmpty"],
  boolean: ["isTrue", "isFalse"],
};

export const OPERATOR_LABEL: Record<FilterOperator, string> = {
  eq: "equals",
  neq: "does not equal",
  contains: "contains",
  notContains: "does not contain",
  startsWith: "starts with",
  endsWith: "ends with",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
  gt: "greater than",
  gte: "≥",
  lt: "less than",
  lte: "≤",
  between: "between",
  before: "before",
  after: "after",
  on: "on",
  relToday: "today",
  relYesterday: "yesterday",
  relTomorrow: "tomorrow",
  relThisWeek: "this week",
  relLastWeek: "last week",
  relNextWeek: "next week",
  relThisMonth: "this month",
  relLastMonth: "last month",
  relThisYear: "this year",
  relLastYear: "last year",
  relLastNDays: "in the last N days",
  relNextNDays: "in the next N days",
  in: "in",
  notIn: "not in",
  isTrue: "is true",
  isFalse: "is false",
};
