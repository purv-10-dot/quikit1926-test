import type { Prisma } from "@prisma/client";
import type { FilterOperator } from "./registry";

/**
 * Translate custom-field filters into Prisma `where` fragments on QtIssue.
 *
 * Each filter becomes a condition on the `fieldValues` relation so issues are
 * filtered by their stored value (NFR-02 — value columns are indexed). Multiple
 * filters AND together; callers spread the result into `where.AND`.
 */
export interface CustomFilter {
  fieldId: string;
  type: string;
  op: FilterOperator;
  value?: unknown;
  /** Upper bound for `between`. */
  value2?: unknown;
}

function valueCondition(f: CustomFilter): Prisma.QtIssueFieldValueWhereInput | null {
  const v = f.value;
  switch (f.op) {
    case "contains":
      return { valueText: { contains: String(v), mode: "insensitive" } };
    case "equals":
      // Case-insensitive on purpose: `equals` is only offered on the typed text
      // types (SHORT_TEXT / LONG_TEXT / URL — see registry.ts), so the operand is
      // whatever the user typed. `is`/`in`/`has_*` below stay exact because their
      // operands are ids / picked option values, not free text.
      return { valueText: { equals: String(v), mode: "insensitive" } };
    case "eq":
      return { valueNumber: Number(v) };
    case "neq":
      return { valueNumber: { not: Number(v) } };
    case "lt":
      return { valueNumber: { lt: Number(v) } };
    case "gt":
      return { valueNumber: { gt: Number(v) } };
    case "between":
      return f.type === "DATE"
        ? { valueDate: { gte: new Date(String(v)), lte: new Date(String(f.value2)) } }
        : { valueNumber: { gte: Number(v), lte: Number(f.value2) } };
    case "before":
      return { valueDate: { lt: new Date(String(v)) } };
    case "after":
      return { valueDate: { gt: new Date(String(v)) } };
    case "in":
      return Array.isArray(v) ? { valueText: { in: v.map(String) } } : { valueText: String(v) };
    case "not_in":
      return Array.isArray(v) ? { valueText: { notIn: v.map(String) } } : { valueText: { not: String(v) } };
    case "is_true":
      return { valueBoolean: true };
    case "is_false":
      return { valueBoolean: false };
    case "is":
      return { valueText: String(v) };
    case "is_not":
      return { valueText: { not: String(v) } };
    case "has_any":
      return Array.isArray(v) && v.length
        ? { OR: v.map((x) => ({ valueJson: { array_contains: String(x) } })) }
        : null;
    case "has_all":
      return Array.isArray(v) && v.length
        ? { AND: v.map((x) => ({ valueJson: { array_contains: String(x) } })) }
        : null;
    default:
      return null;
  }
}

export function customFiltersToWhere(filters: CustomFilter[]): Prisma.QtIssueWhereInput[] {
  const out: Prisma.QtIssueWhereInput[] = [];
  for (const f of filters) {
    if (!f.fieldId) continue;
    // A cross-project aggregated field carries several real field ids (the
    // per-project copies of e.g. "Theme") joined by commas. A plain single id
    // has no comma, so this stays backwards-compatible with the Backlog/Board.
    const ids = f.fieldId.includes(",")
      ? f.fieldId.split(",").map((s) => s.trim()).filter(Boolean)
      : [f.fieldId];
    if (ids.length === 0) continue;

    const fieldIdCond: Prisma.StringFilter | string =
      ids.length === 1 ? ids[0]! : { in: ids };

    if (f.op === "is_empty") {
      out.push({ fieldValues: { none: { fieldId: fieldIdCond } } });
      continue;
    }
    if (f.op === "is_not_empty") {
      out.push({ fieldValues: { some: { fieldId: fieldIdCond } } });
      continue;
    }
    const cond = valueCondition(f);
    if (cond) out.push({ fieldValues: { some: { fieldId: fieldIdCond, ...cond } } });
  }
  return out;
}

/** Safe-parse the `customFilters` query param (JSON array). */
export function parseCustomFilters(raw: string | null): CustomFilter[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((f) => f && typeof f.fieldId === "string" && typeof f.op === "string");
  } catch {
    return [];
  }
}
