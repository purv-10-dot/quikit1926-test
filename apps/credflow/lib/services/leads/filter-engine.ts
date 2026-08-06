import type { ConditionRowInput, FilterPayloadInput } from "@/lib/validators/lead-filter";
import { Prisma } from "@quikit/database";
import { LEAD_FILTER_FIELD_NAMES, getFilterField } from "@/lib/lead-filter-fields";
import type { FilterFieldDef } from "@/types/lead-filter";
import type { LeadFieldDefinition } from "@/types/field-definition";
import { LEAD_QUICK_SEARCH_FIELD, LEAD_QUICK_SEARCH_COLUMNS } from "@/lib/services/leads/filter-constants";

type WhereFragment = Record<string, unknown>;

// Re-export the client-safe constants so existing server-side imports from this
// module keep working. The definitions live in filter-constants.ts so client
// components can import them WITHOUT pulling in the Prisma client (value import
// above), which cannot run in the browser.
export { LEAD_QUICK_SEARCH_FIELD, LEAD_QUICK_SEARCH_COLUMNS };

/** OR across text columns for the quick-search box. */
export function buildLeadQuickSearchWhere(term: unknown): WhereFragment | null {
  const s = typeof term === "string" ? term.trim() : term == null ? "" : String(term).trim();
  if (!s) return null;
  return {
    OR: LEAD_QUICK_SEARCH_COLUMNS.map((field) => ({
      [field]: { contains: s, mode: "insensitive" },
    })),
  };
}

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function coerceDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Relative date ranges (Build 1a)
//
// All boundary math is done in IST (Asia/Kolkata, fixed +05:30, no DST) so the
// filter agrees with the app's display timezone (DISPLAY_TZ="Asia/Kolkata" in
// lib/utils/date-helpers.ts). Computing "this week"/"today" in naive UTC would
// put the boundaries 5.5h off from what a user in India sees.
//
// Strategy: shift the instant by +5:30 to get a Date whose UTC fields read as
// IST wall-clock, do calendar arithmetic on those UTC fields, then shift the
// resulting boundaries back by −5:30 to real UTC instants.
// ────────────────────────────────────────────────────────────────────────────

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** All relative-date operators (must mirror types/lead-filter.ts + the Zod enum). */
export const RELATIVE_DATE_OPERATORS = [
  "relToday",
  "relYesterday",
  "relTomorrow",
  "relThisWeek",
  "relLastWeek",
  "relNextWeek",
  "relThisMonth",
  "relLastMonth",
  "relThisYear",
  "relLastYear",
  "relLastNDays",
  "relNextNDays",
] as const;

export type RelativeDateOperator = (typeof RELATIVE_DATE_OPERATORS)[number];

const RELATIVE_DATE_OPERATOR_SET = new Set<string>(RELATIVE_DATE_OPERATORS);

export function isRelativeDateOperator(op: string): op is RelativeDateOperator {
  return RELATIVE_DATE_OPERATOR_SET.has(op);
}

/** UTC-field view of an instant shifted into IST wall-clock. */
function toIstFields(now: Date): { y: number; m: number; d: number; dow: number } {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    dow: shifted.getUTCDay(), // 0=Sun..6=Sat
  };
}

/** Real UTC instant for an IST wall-clock calendar moment. */
function istWallToUtc(
  y: number,
  m: number,
  d: number,
  hh = 0,
  mm = 0,
  ss = 0,
  ms = 0,
): Date {
  return new Date(Date.UTC(y, m, d, hh, mm, ss, ms) - IST_OFFSET_MS);
}

function istStartOfDay(y: number, m: number, d: number): Date {
  return istWallToUtc(y, m, d, 0, 0, 0, 0);
}
function istEndOfDay(y: number, m: number, d: number): Date {
  return istWallToUtc(y, m, d, 23, 59, 59, 999);
}

/**
 * Resolve a relative-date operator to an inclusive { gte, lte } UTC window,
 * or null when the operator isn't relative or its N is missing/invalid.
 *
 * Weeks are Monday-start (ISO). "last/next N days" are inclusive windows that
 * include today (Last N = the trailing N days ending today; Next N = today plus
 * the next N−1 days).
 */
export function resolveRelativeDateRange(
  operator: string,
  n?: number | null,
  now: Date = new Date(),
): { gte: Date; lte: Date } | null {
  if (!isRelativeDateOperator(operator)) return null;

  const { y, m, d, dow } = toIstFields(now);

  switch (operator) {
    case "relToday":
      return { gte: istStartOfDay(y, m, d), lte: istEndOfDay(y, m, d) };

    case "relYesterday": {
      const s = istStartOfDay(y, m, d - 1);
      const e = istEndOfDay(y, m, d - 1);
      return { gte: s, lte: e };
    }

    case "relTomorrow": {
      const s = istStartOfDay(y, m, d + 1);
      const e = istEndOfDay(y, m, d + 1);
      return { gte: s, lte: e };
    }

    case "relThisWeek": {
      // Monday-start: days since Monday = (dow + 6) % 7.
      const back = (dow + 6) % 7;
      return { gte: istStartOfDay(y, m, d - back), lte: istEndOfDay(y, m, d - back + 6) };
    }
    case "relLastWeek": {
      const back = (dow + 6) % 7;
      return { gte: istStartOfDay(y, m, d - back - 7), lte: istEndOfDay(y, m, d - back - 1) };
    }
    case "relNextWeek": {
      const back = (dow + 6) % 7;
      return { gte: istStartOfDay(y, m, d - back + 7), lte: istEndOfDay(y, m, d - back + 13) };
    }

    case "relThisMonth":
      return { gte: istStartOfDay(y, m, 1), lte: istEndOfDay(y, m + 1, 0) };
    case "relLastMonth":
      return { gte: istStartOfDay(y, m - 1, 1), lte: istEndOfDay(y, m, 0) };

    case "relThisYear":
      return { gte: istStartOfDay(y, 0, 1), lte: istEndOfDay(y, 11, 31) };
    case "relLastYear":
      return { gte: istStartOfDay(y - 1, 0, 1), lte: istEndOfDay(y - 1, 11, 31) };

    case "relLastNDays": {
      if (n == null || !Number.isFinite(n) || n < 1) return null;
      const days = Math.floor(n);
      return { gte: istStartOfDay(y, m, d - (days - 1)), lte: istEndOfDay(y, m, d) };
    }
    case "relNextNDays": {
      if (n == null || !Number.isFinite(n) || n < 1) return null;
      const days = Math.floor(n);
      return { gte: istStartOfDay(y, m, d), lte: istEndOfDay(y, m, d + (days - 1)) };
    }
  }
}

function translateCondition(c: ConditionRowInput, def: FilterFieldDef): WhereFragment | null {
  const { field, operator, value, valueTo } = c;

  if (def.type === "boolean") {
    if (operator === "isTrue") return { [field]: true };
    if (operator === "isFalse") return { [field]: false };
    return null;
  }

  if (operator === "isEmpty") {
    return { OR: [{ [field]: null }, { [field]: "" }] };
  }
  if (operator === "isNotEmpty") {
    return { AND: [{ [field]: { not: null } }, { [field]: { not: "" } }] };
  }

  if (def.type === "text") {
    const s = typeof value === "string" ? value : value == null ? "" : String(value);
    switch (operator) {
      case "eq":          return { [field]: { equals: s, mode: "insensitive" } };
      case "neq":         return { NOT: { [field]: { equals: s, mode: "insensitive" } } };
      case "contains":    return { [field]: { contains: s, mode: "insensitive" } };
      case "notContains": return { NOT: { [field]: { contains: s, mode: "insensitive" } } };
      case "startsWith":  return { [field]: { startsWith: s, mode: "insensitive" } };
      case "endsWith":    return { [field]: { endsWith: s, mode: "insensitive" } };
      default: return null;
    }
  }

  if (def.type === "number") {
    if (operator === "between") {
      const a = coerceNumber(value);
      const b = coerceNumber(valueTo);
      if (a == null || b == null) return null;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return { [field]: { gte: lo, lte: hi } };
    }
    const n = coerceNumber(value);
    if (n == null) return null;
    switch (operator) {
      case "eq":  return { [field]: n };
      case "neq": return { NOT: { [field]: n } };
      case "gt":  return { [field]: { gt: n } };
      case "gte": return { [field]: { gte: n } };
      case "lt":  return { [field]: { lt: n } };
      case "lte": return { [field]: { lte: n } };
      default: return null;
    }
  }

  if (def.type === "date") {
    // Relative operators (Build 1a) — resolve to an inclusive IST window.
    if (isRelativeDateOperator(operator)) {
      const range = resolveRelativeDateRange(operator, coerceNumber(value), new Date());
      if (!range) return null;
      return { [field]: { gte: range.gte, lte: range.lte } };
    }
    if (operator === "between") {
      const a = coerceDate(value);
      const b = coerceDate(valueTo);
      if (!a || !b) return null;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return { [field]: { gte: startOfDay(lo), lte: endOfDay(hi) } };
    }
    const d = coerceDate(value);
    if (!d) return null;
    switch (operator) {
      case "on":     return { [field]: { gte: startOfDay(d), lte: endOfDay(d) } };
      case "before": return { [field]: { lt: startOfDay(d) } };
      case "after":  return { [field]: { gt: endOfDay(d) } };
      default: return null;
    }
  }

  if (def.type === "select") {
    if (operator === "in" || operator === "notIn") {
      const arr = Array.isArray(value)
        ? (value as (string | number)[])
        : value != null
        ? [value as string | number]
        : [];
      if (arr.length === 0) return null;
      return operator === "in" ? { [field]: { in: arr } } : { NOT: { [field]: { in: arr } } };
    }
    const scalar = value == null ? "" : String(value);
    if (operator === "eq") return { [field]: { equals: scalar, mode: "insensitive" } };
    if (operator === "neq") return { NOT: { [field]: { equals: scalar, mode: "insensitive" } } };
    return null;
  }

  return null;
}

/**
 * Translate a condition that targets a CUSTOM field stored in Lead.dynamicFields.
 * Uses Prisma's `path`-based JSON filter (Postgres-only).
 *
 * Limitations:
 *   - `in` / `notIn` are emulated via OR-of-equals (Prisma JSON has no `in`).
 *   - `isEmpty` = Prisma.AnyNull, which matches BOTH an absent key and an
 *     explicit JSON null (so leads that never had the key are correctly "empty").
 */
function translateDynamicCondition(c: ConditionRowInput, def: LeadFieldDefinition): WhereFragment | null {
  const path = [def.key];
  const { operator, value, valueTo } = c;

  // Boolean
  if (def.fieldType === "Boolean") {
    if (operator === "isTrue") return { dynamicFields: { path, equals: true } };
    if (operator === "isFalse") return { dynamicFields: { path, equals: false } };
    return null;
  }

  // Empty / not-empty.
  // Prisma.AnyNull matches BOTH an absent key (DB null) AND an explicit JSON
  // null, so "is empty" catches leads that never had the key — the common case,
  // since creating a custom field does not backfill existing leads. The prior
  // `equals: null` only matched key-present-and-JSON-null and silently missed
  // absent keys. Verified on dev data (demo_date): isEmpty=140, isNotEmpty=1.
  if (operator === "isEmpty") return { dynamicFields: { path, equals: Prisma.AnyNull } };
  if (operator === "isNotEmpty") return { NOT: { dynamicFields: { path, equals: Prisma.AnyNull } } };

  // Text-like
  if (["Text", "TextArea", "Email", "Phone"].includes(def.fieldType)) {
    const s = typeof value === "string" ? value : value == null ? "" : String(value);
    switch (operator) {
      case "eq":          return { dynamicFields: { path, equals: s } };
      case "neq":         return { NOT: { dynamicFields: { path, equals: s } } };
      case "contains":    return { dynamicFields: { path, string_contains: s } };
      case "notContains": return { NOT: { dynamicFields: { path, string_contains: s } } };
      case "startsWith":  return { dynamicFields: { path, string_starts_with: s } };
      case "endsWith":    return { dynamicFields: { path, string_ends_with: s } };
      default: return null;
    }
  }

  // Number
  if (def.fieldType === "Number") {
    if (operator === "between") {
      const a = coerceNumber(value);
      const b = coerceNumber(valueTo);
      if (a == null || b == null) return null;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return { AND: [{ dynamicFields: { path, gte: lo } }, { dynamicFields: { path, lte: hi } }] };
    }
    const n = coerceNumber(value);
    if (n == null) return null;
    switch (operator) {
      case "eq":  return { dynamicFields: { path, equals: n } };
      case "neq": return { NOT: { dynamicFields: { path, equals: n } } };
      case "gt":  return { dynamicFields: { path, gt: n } };
      case "gte": return { dynamicFields: { path, gte: n } };
      case "lt":  return { dynamicFields: { path, lt: n } };
      case "lte": return { dynamicFields: { path, lte: n } };
      default: return null;
    }
  }

  // Date — values stored as ISO strings; rely on string ordering (ISO 8601 sorts correctly)
  if (def.fieldType === "Date") {
    // Relative operators (Build 1a, Fix 1 parity) — same IST window as standard
    // date columns, applied as ISO-string bounds on the JSON path.
    if (isRelativeDateOperator(operator)) {
      const range = resolveRelativeDateRange(operator, coerceNumber(value), new Date());
      if (!range) return null;
      return {
        AND: [
          { dynamicFields: { path, gte: range.gte.toISOString() } },
          { dynamicFields: { path, lte: range.lte.toISOString() } },
        ],
      };
    }
    if (operator === "between") {
      const a = coerceDate(value);
      const b = coerceDate(valueTo);
      if (!a || !b) return null;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return {
        AND: [
          { dynamicFields: { path, gte: startOfDay(lo).toISOString() } },
          { dynamicFields: { path, lte: endOfDay(hi).toISOString() } },
        ],
      };
    }
    const d = coerceDate(value);
    if (!d) return null;
    switch (operator) {
      case "on":     return {
        AND: [
          { dynamicFields: { path, gte: startOfDay(d).toISOString() } },
          { dynamicFields: { path, lte: endOfDay(d).toISOString() } },
        ],
      };
      case "before": return { dynamicFields: { path, lt: startOfDay(d).toISOString() } };
      case "after":  return { dynamicFields: { path, gt: endOfDay(d).toISOString() } };
      default: return null;
    }
  }

  // MultiSelect — values stored as a JSON string array (e.g. ["Tally","Busy"]).
  // Match with array_contains so "is X" matches X whether it's the only value or
  // one of several. `equals` (used for scalar Select below) would compare the
  // WHOLE array to the scalar and only match a single-element array — the bug
  // this fixes. Verified on dev data (accounting_software): contains "Tally"=2
  // (single + multi-value lead), "Busy"=1, absent option=0.
  if (def.fieldType === "MultiSelect") {
    const arr = Array.isArray(value) ? (value as string[]) : value != null ? [String(value)] : [];
    if (operator === "in" || operator === "notIn") {
      if (arr.length === 0) return null;
      // "in" = the lead's array contains ANY of the chosen values.
      const ors = arr.map((v) => ({
        dynamicFields: { path, array_contains: [v] } as Record<string, unknown>,
      }));
      return operator === "in" ? { OR: ors } : { NOT: { OR: ors } };
    }
    if (operator === "eq") {
      const v = value == null ? "" : String(value);
      return { dynamicFields: { path, array_contains: [v] } };
    }
    if (operator === "neq") {
      const v = value == null ? "" : String(value);
      return { NOT: { dynamicFields: { path, array_contains: [v] } } };
    }
    return null;
  }

  // Select (scalar string) — emulate `in` via OR-of-equals.
  if (def.fieldType === "Select") {
    if (operator === "in" || operator === "notIn") {
      const arr = Array.isArray(value) ? (value as string[]) : value != null ? [String(value)] : [];
      if (arr.length === 0) return null;
      const ors = arr.map((v) => ({ dynamicFields: { path, equals: v } as Record<string, unknown> }));
      return operator === "in" ? { OR: ors } : { NOT: { OR: ors } };
    }
    if (operator === "eq")  return { dynamicFields: { path, equals: value } };
    if (operator === "neq") return { NOT: { dynamicFields: { path, equals: value } } };
    return null;
  }

  return null;
}

export function translateFilterToPrismaWhere(
  payload: FilterPayloadInput,
  customDefs: LeadFieldDefinition[] = [],
): Record<string, unknown> {
  if (!payload.conditions || payload.conditions.length === 0) return {};

  const customByKey = new Map(customDefs.filter((d) => !d.isStandard).map((d) => [d.key, d]));
  const fragments: WhereFragment[] = [];

  for (const c of payload.conditions) {
    if (c.field === LEAD_QUICK_SEARCH_FIELD) {
      const frag = buildLeadQuickSearchWhere(c.value);
      if (frag) fragments.push(frag);
      continue;
    }
    if (LEAD_FILTER_FIELD_NAMES.has(c.field)) {
      const def = getFilterField(c.field);
      if (!def) continue;
      const frag = translateCondition(c, def);
      if (frag) fragments.push(frag);
      continue;
    }
    const dynDef = customByKey.get(c.field);
    if (dynDef) {
      const frag = translateDynamicCondition(c, dynDef);
      if (frag) fragments.push(frag);
      continue;
    }
    // Unknown field — drop silently (legacy parity)
  }
  if (fragments.length === 0) return {};
  if (fragments.length === 1) return fragments[0]!;
  return payload.matchMode === "ANY" ? { OR: fragments } : { AND: fragments };
}
