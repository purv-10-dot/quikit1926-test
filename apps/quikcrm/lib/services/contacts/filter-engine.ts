/**
 * Translate the filter DSL (matchMode + ConditionRow[]) into a Prisma `where`
 * clause for the CrmContact model. Mirrors the lead filter-engine but only
 * supports standard fields — contacts have no dynamic-field column.
 *
 * Unknown field names are dropped silently (legacy parity).
 */

import type { Prisma } from "@quikit/database";
import type { ConditionRowInput, FilterPayloadInput } from "@/lib/validators/lead-filter";
import {
  CONTACT_FILTER_FIELD_NAMES,
  getContactFilterField,
} from "@/lib/contact-filter-fields";
import type { FilterFieldDef } from "@/types/lead-filter";

type WhereFragment = Record<string, unknown>;

const CONTACT_SEARCH_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "title",
  "ownerName",
] as const;

/** Build the OR clause used by GET /api/contacts?q=… and POST /api/contacts/filter. */
export function buildContactSearchOr(search: string): Prisma.CrmContactWhereInput[] {
  const q = search.trim();
  if (!q) return [];
  return CONTACT_SEARCH_FIELDS.map((field) => ({
    [field]: { contains: q, mode: "insensitive" },
  }));
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

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

function translateCondition(
  c: ConditionRowInput,
  def: FilterFieldDef,
): WhereFragment | null {
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
      return operator === "in"
        ? { [field]: { in: arr } }
        : { NOT: { [field]: { in: arr } } };
    }
    const s = typeof value === "string" ? value : value == null ? "" : String(value);
    if (operator === "eq") {
      return { [field]: { equals: s, mode: "insensitive" } };
    }
    if (operator === "neq") {
      return { NOT: { [field]: { equals: s, mode: "insensitive" } } };
    }
    return null;
  }

  return null;
}

export function translateContactFilterToPrismaWhere(
  payload: FilterPayloadInput,
): Record<string, unknown> {
  if (!payload.conditions || payload.conditions.length === 0) return {};

  const fragments: WhereFragment[] = [];
  for (const c of payload.conditions) {
    if (!CONTACT_FILTER_FIELD_NAMES.has(c.field)) continue;
    const def = getContactFilterField(c.field);
    if (!def) continue;
    const frag = translateCondition(c, def);
    if (frag) fragments.push(frag);
  }
  if (fragments.length === 0) return {};
  if (fragments.length === 1) return fragments[0]!;
  return payload.matchMode === "ANY" ? { OR: fragments } : { AND: fragments };
}
