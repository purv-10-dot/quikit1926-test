/**
 * Translate the filter DSL (ConditionRow[] + matchMode) into a Prisma `where`
 * clause for the Lead model.
 *
 * Behavior parity with quikcrm-backend/src/leads/leads.service.ts ::filter().
 *
 * Supports:
 *   - Standard fields (catalog in src/lib/lead-filter-fields.ts) → direct column queries.
 *   - Custom fields (org-defined; passed in via the `customDefs` argument) → JSON
 *     queries against Lead.dynamicFields using Prisma's path-based JSON filters.
 *
 * Validation: unknown field names (not in either catalog) are dropped silently
 * — matches legacy permissive behavior.
 */

import type { ConditionRowInput, FilterPayloadInput } from "@/lib/validators/lead-filter";
import { LEAD_FILTER_FIELD_NAMES, getFilterField } from "@/lib/lead-filter-fields";
import type { FilterFieldDef } from "@/types/lead-filter";
import type { LeadFieldDefinition } from "@/types/field-definition";

type WhereFragment = Record<string, unknown>;

/** Pseudo-field sent by the leads toolbar search box (not shown in advanced filter). */
export const LEAD_QUICK_SEARCH_FIELD = "__quickSearch";

/** Columns matched by the toolbar "Search name, email, company…" input. */
export const LEAD_QUICK_SEARCH_COLUMNS = [
  "name",
  "email",
  "company",
  "phone",
  "mobile",
  "jobTitle",
] as const;

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
 *   - `isEmpty` checks for null at the path — does NOT detect missing keys.
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

  // Empty / not-empty
  if (operator === "isEmpty") return { dynamicFields: { path, equals: null } };
  if (operator === "isNotEmpty") return { NOT: { dynamicFields: { path, equals: null } } };

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

  // Select / MultiSelect — emulate `in` via OR-of-equals
  if (def.fieldType === "Select" || def.fieldType === "MultiSelect") {
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
