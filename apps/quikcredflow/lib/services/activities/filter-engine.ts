// Translate the filter DSL into a Prisma `where` for QcfActivity.
// Mirrors lib/services/contacts/filter-engine.ts but adds JSON-path
// handling for the embedded `outreach` document.
import type { ConditionRowInput, FilterPayloadInput } from "@/lib/validators/lead-filter";
import {
  ACTIVITY_FILTER_FIELD_NAMES,
  getActivityFilterField,
} from "@/lib/activity-filter-fields";
import type { FilterFieldDef } from "@/types/lead-filter";

type WhereFragment = Record<string, unknown>;

function coerceDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function jsonPathFragment(field: string, frag: WhereFragment): WhereFragment {
  // Wrap a leaf comparison into a Prisma JSON path. Field has format
  // "outreach.<key>" → { outreach: { path: ["<key>"], <comparator> } }
  const segments = field.split(".");
  if (segments.length !== 2 || segments[0] !== "outreach") return frag;
  const key = segments[1]!;
  const inner = frag[field] ?? frag;
  // Prisma JSON filter uses string_contains / equals / etc. on the JSON path.
  return { outreach: { path: [key], ...(inner as Record<string, unknown>) } };
}

function translate(c: ConditionRowInput, def: FilterFieldDef): WhereFragment | null {
  const { field, operator, value, valueTo } = c;
  const isJson = field.startsWith("outreach.");

  if (operator === "isEmpty") {
    if (isJson) {
      return jsonPathFragment(field, { [field]: { equals: "" } });
    }
    return { OR: [{ [field]: null }, { [field]: "" }] };
  }
  if (operator === "isNotEmpty") {
    if (isJson) {
      return jsonPathFragment(field, { [field]: { not: "" } });
    }
    return { AND: [{ [field]: { not: null } }, { [field]: { not: "" } }] };
  }

  if (def.type === "text") {
    const s = typeof value === "string" ? value : value == null ? "" : String(value);
    if (isJson) {
      switch (operator) {
        case "eq":
          return jsonPathFragment(field, { [field]: { equals: s } });
        case "neq":
          return { NOT: jsonPathFragment(field, { [field]: { equals: s } }) };
        case "contains":
          return jsonPathFragment(field, { [field]: { string_contains: s } });
        case "notContains":
          return { NOT: jsonPathFragment(field, { [field]: { string_contains: s } }) };
        case "startsWith":
          return jsonPathFragment(field, { [field]: { string_starts_with: s } });
        case "endsWith":
          return jsonPathFragment(field, { [field]: { string_ends_with: s } });
        default:
          return null;
      }
    }
    switch (operator) {
      case "eq":
        return { [field]: { equals: s, mode: "insensitive" } };
      case "neq":
        return { NOT: { [field]: { equals: s, mode: "insensitive" } } };
      case "contains":
        return { [field]: { contains: s, mode: "insensitive" } };
      case "notContains":
        return { NOT: { [field]: { contains: s, mode: "insensitive" } } };
      case "startsWith":
        return { [field]: { startsWith: s, mode: "insensitive" } };
      case "endsWith":
        return { [field]: { endsWith: s, mode: "insensitive" } };
      default:
        return null;
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
      case "on":
        return { [field]: { gte: startOfDay(d), lte: endOfDay(d) } };
      case "before":
        return { [field]: { lt: startOfDay(d) } };
      case "after":
        return { [field]: { gt: endOfDay(d) } };
      default:
        return null;
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
    if (operator === "eq") return { [field]: value };
    if (operator === "neq") return { NOT: { [field]: value } };
    return null;
  }

  return null;
}

export function translateActivityFilterToPrismaWhere(
  payload: FilterPayloadInput,
): Record<string, unknown> {
  if (!payload.conditions || payload.conditions.length === 0) return {};

  const fragments: WhereFragment[] = [];
  for (const c of payload.conditions) {
    if (!ACTIVITY_FILTER_FIELD_NAMES.has(c.field)) continue;
    const def = getActivityFilterField(c.field);
    if (!def) continue;
    const frag = translate(c, def);
    if (frag) fragments.push(frag);
  }
  if (fragments.length === 0) return {};
  if (fragments.length === 1) return fragments[0]!;
  return payload.matchMode === "ANY" ? { OR: fragments } : { AND: fragments };
}
