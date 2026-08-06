/**
 * Advanced filter + quick search for CrmOpportunity.
 * Keep ALLOWED_FILTER_FIELDS in sync with `lib/opportunity-filter-fields.ts`.
 */
import type { Prisma } from "@quikit/database";

export const OPPORTUNITY_QUICK_SEARCH_COLUMNS = ["name", "ownerName"] as const;

interface RawCondition {
  field: string;
  operator: string;
  value?: unknown;
  values?: unknown[];
}

const ALLOWED_FILTER_FIELDS = new Set<string>([
  "name",
  "accountName",
  "stage",
  "ownerName",
  "ownerId",
  "amount",
  "probability",
  "currency",
  "weightedAmount",
  "closeDate",
  "createdAt",
]);

const DATE_FIELDS = new Set<string>(["closeDate", "createdAt"]);

const INSENSITIVE_EQ_FIELDS = new Set<string>(["name", "ownerName", "currency", "stage"]);

function parseFilterDate(v: unknown): Date | null {
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

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

/** OR across name, account name, and owner for the toolbar search box. */
export function buildOpportunityQuickSearchWhere(
  term: unknown,
): Prisma.CrmOpportunityWhereInput | null {
  const s = typeof term === "string" ? term.trim() : term == null ? "" : String(term).trim();
  if (!s) return null;
  return {
    OR: [
      { name: { contains: s, mode: "insensitive" } },
      { ownerName: { contains: s, mode: "insensitive" } },
      { account: { name: { contains: s, mode: "insensitive" } } },
    ],
  };
}

export function buildAdvancedOpportunityWhere(
  conditions: RawCondition[],
  combinator: "AND" | "OR",
): Prisma.CrmOpportunityWhereInput | null {
  const built: Prisma.CrmOpportunityWhereInput[] = [];
  for (const c of conditions) {
    if (!ALLOWED_FILTER_FIELDS.has(c.field)) continue;
    const fragment = buildSingleCondition(c);
    if (fragment) built.push(fragment);
  }
  if (built.length === 0) return null;
  return combinator === "OR" ? { OR: built } : { AND: built };
}

function buildSingleCondition(c: RawCondition): Prisma.CrmOpportunityWhereInput | null {
  const { field, operator } = c;

  if (field === "accountName") {
    return buildAccountNameCondition(operator, c);
  }

  if (DATE_FIELDS.has(field)) {
    return buildDateCondition(field, operator, c);
  }

  if (field === "amount" || field === "probability" || field === "weightedAmount") {
    return buildNumericCondition(field, operator, c);
  }

  switch (operator) {
    case "eq":
      if (INSENSITIVE_EQ_FIELDS.has(field) && typeof c.value === "string") {
        return { [field]: { equals: c.value, mode: "insensitive" } } as Prisma.CrmOpportunityWhereInput;
      }
      return { [field]: c.value } as Prisma.CrmOpportunityWhereInput;
    case "ne":
      if (INSENSITIVE_EQ_FIELDS.has(field) && typeof c.value === "string") {
        return {
          NOT: { [field]: { equals: c.value, mode: "insensitive" } },
        } as Prisma.CrmOpportunityWhereInput;
      }
      return { NOT: { [field]: c.value } } as Prisma.CrmOpportunityWhereInput;
    case "contains":
      return {
        [field]: { contains: String(c.value ?? ""), mode: "insensitive" },
      } as Prisma.CrmOpportunityWhereInput;
    case "startsWith":
      return {
        [field]: { startsWith: String(c.value ?? ""), mode: "insensitive" },
      } as Prisma.CrmOpportunityWhereInput;
    case "endsWith":
      return {
        [field]: { endsWith: String(c.value ?? ""), mode: "insensitive" },
      } as Prisma.CrmOpportunityWhereInput;
    case "in":
      return { [field]: { in: c.values ?? [] } } as Prisma.CrmOpportunityWhereInput;
    case "notIn":
      return { [field]: { notIn: c.values ?? [] } } as Prisma.CrmOpportunityWhereInput;
    case "isNull":
      return { [field]: null } as Prisma.CrmOpportunityWhereInput;
    case "notNull":
      return { NOT: { [field]: null } } as Prisma.CrmOpportunityWhereInput;
    default:
      return null;
  }
}

function buildAccountNameCondition(
  operator: string,
  c: RawCondition,
): Prisma.CrmOpportunityWhereInput | null {
  const val = String(c.value ?? "");
  switch (operator) {
    case "eq":
      return { account: { name: { equals: val, mode: "insensitive" } } };
    case "ne":
      return { NOT: { account: { name: { equals: val, mode: "insensitive" } } } };
    case "contains":
      return { account: { name: { contains: val, mode: "insensitive" } } };
    case "startsWith":
      return { account: { name: { startsWith: val, mode: "insensitive" } } };
    case "endsWith":
      return { account: { name: { endsWith: val, mode: "insensitive" } } };
    case "isNull":
      return { accountId: null };
    case "notNull":
      return { accountId: { not: null } };
    case "in":
      return { account: { name: { in: (c.values ?? []).map(String) } } };
    case "notIn":
      return { account: { name: { notIn: (c.values ?? []).map(String) } } };
    default:
      return null;
  }
}

function buildDateCondition(
  field: string,
  operator: string,
  c: RawCondition,
): Prisma.CrmOpportunityWhereInput | null {
  switch (operator) {
    case "eq": {
      const d = parseFilterDate(c.value);
      if (!d) return null;
      return { [field]: { gte: startOfDay(d), lte: endOfDay(d) } } as Prisma.CrmOpportunityWhereInput;
    }
    case "gt": {
      const d = parseFilterDate(c.value);
      if (!d) return null;
      return { [field]: { gt: endOfDay(d) } } as Prisma.CrmOpportunityWhereInput;
    }
    case "gte": {
      const d = parseFilterDate(c.value);
      if (!d) return null;
      return { [field]: { gte: startOfDay(d) } } as Prisma.CrmOpportunityWhereInput;
    }
    case "lt": {
      const d = parseFilterDate(c.value);
      if (!d) return null;
      return { [field]: { lt: startOfDay(d) } } as Prisma.CrmOpportunityWhereInput;
    }
    case "lte": {
      const d = parseFilterDate(c.value);
      if (!d) return null;
      return { [field]: { lte: endOfDay(d) } } as Prisma.CrmOpportunityWhereInput;
    }
    case "between": {
      if (!Array.isArray(c.values) || c.values.length !== 2) return null;
      const a = parseFilterDate(c.values[0]);
      const b = parseFilterDate(c.values[1]);
      if (!a || !b) return null;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return {
        [field]: { gte: startOfDay(lo), lte: endOfDay(hi) },
      } as Prisma.CrmOpportunityWhereInput;
    }
    case "isNull":
      return { [field]: null } as Prisma.CrmOpportunityWhereInput;
    case "notNull":
      return { NOT: { [field]: null } } as Prisma.CrmOpportunityWhereInput;
    default:
      return null;
  }
}

function buildNumericCondition(
  field: string,
  operator: string,
  c: RawCondition,
): Prisma.CrmOpportunityWhereInput | null {
  switch (operator) {
    case "eq": {
      const n = coerceNumber(c.value);
      if (n == null) return null;
      return { [field]: n } as Prisma.CrmOpportunityWhereInput;
    }
    case "ne": {
      const n = coerceNumber(c.value);
      if (n == null) return null;
      return { NOT: { [field]: n } } as Prisma.CrmOpportunityWhereInput;
    }
    case "gt": {
      const n = coerceNumber(c.value);
      if (n == null) return null;
      return { [field]: { gt: n } } as Prisma.CrmOpportunityWhereInput;
    }
    case "gte": {
      const n = coerceNumber(c.value);
      if (n == null) return null;
      return { [field]: { gte: n } } as Prisma.CrmOpportunityWhereInput;
    }
    case "lt": {
      const n = coerceNumber(c.value);
      if (n == null) return null;
      return { [field]: { lt: n } } as Prisma.CrmOpportunityWhereInput;
    }
    case "lte": {
      const n = coerceNumber(c.value);
      if (n == null) return null;
      return { [field]: { lte: n } } as Prisma.CrmOpportunityWhereInput;
    }
    case "between": {
      if (!Array.isArray(c.values) || c.values.length !== 2) return null;
      const a = coerceNumber(c.values[0]);
      const b = coerceNumber(c.values[1]);
      if (a == null || b == null) return null;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return { [field]: { gte: lo, lte: hi } } as Prisma.CrmOpportunityWhereInput;
    }
    case "isNull":
      return { [field]: null } as Prisma.CrmOpportunityWhereInput;
    case "notNull":
      return { NOT: { [field]: null } } as Prisma.CrmOpportunityWhereInput;
    default:
      return null;
  }
}

/** Merge base tenant scope, ACL, advanced conditions, and quick search. */
export function buildOpportunityFilterWhere(args: {
  tenantId: string;
  aclFilter: Record<string, unknown> | null;
  conditions: RawCondition[];
  combinator: "AND" | "OR";
  search?: string;
}): Prisma.CrmOpportunityWhereInput {
  const parts: Prisma.CrmOpportunityWhereInput[] = [
    {
      tenantId: args.tenantId,
      deletedAt: null,
      ...(args.aclFilter ? (args.aclFilter as Prisma.CrmOpportunityWhereInput) : {}),
    },
  ];
  const advanced = buildAdvancedOpportunityWhere(args.conditions, args.combinator);
  if (advanced) parts.push(advanced);
  const quick = buildOpportunityQuickSearchWhere(args.search);
  if (quick) parts.push(quick);
  return parts.length === 1 ? parts[0]! : { AND: parts };
}
