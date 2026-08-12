/**
 * Accounts service — pure helpers for the API layer.
 *
 * Owns:
 *   - Search OR conditions (mirrors quikcrm-backend SEARCHABLE_FIELDS.accounts)
 *   - Revenue display formatting (₹xxCr / ₹xxL / $x.xM …) and best-effort parse
 *   - Industry slugification + segment label/enum mapping
 *   - Owner-name derivation from public.User
 *   - Cycle prevention for parentAccountId
 *   - Activity-row writer for AccountChange events (P2.12)
 *   - Advanced-filter Prisma WHERE builder
 *
 * Side-effect-free except writeAccountActivity which writes one QceActivity row.
 */
import { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";

export const SEARCHABLE_FIELDS = [
  "name",
  "segment",
  "ownerName",
  "industry",
  "website",
  "status",
  "annualRevenueDisplay",
  "city",
  "state",
] as const;

export type AccountSearchField = (typeof SEARCHABLE_FIELDS)[number];

/** Escape user input before feeding it into a Prisma `contains` regex. */
export function escapeSearchRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build the OR clause used by GET /api/accounts?search=…. */
export function buildAccountSearchOr(search: string): Prisma.QceAccountWhereInput[] {
  const escaped = escapeSearchRegex(search.trim());
  if (!escaped) return [];
  return SEARCHABLE_FIELDS.map<Prisma.QceAccountWhereInput>((field) => ({
    [field]: { contains: escaped, mode: "insensitive" } as Prisma.StringFilter,
  }));
}

// =====================================================
// Revenue display formatting (Phase 2.1)
// =====================================================

const INR_LAKH = 100_000;
const INR_CRORE = 10_000_000;

/**
 * Format a numeric amount + currency into the display string the UI expects.
 * - INR uses lakh / crore (e.g. 21_000_000 → "₹2.1Cr ARR").
 * - Other currencies use K / M / B with the matching symbol.
 *
 * Mirrors the existing free-text values like "₹2.1Cr ARR" / "$21.0M ARR".
 */
export function formatRevenueDisplay(
  amount: number | string | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (amount == null || amount === "") return null;
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n) || n < 0) return null;
  const cur = (currency || "INR").toUpperCase();

  if (cur === "INR") {
    if (n >= INR_CRORE) return `₹${stripZeros(n / INR_CRORE)}Cr ARR`;
    if (n >= INR_LAKH) return `₹${stripZeros(n / INR_LAKH)}L ARR`;
    if (n >= 1_000) return `₹${stripZeros(n / 1_000)}K ARR`;
    return `₹${stripZeros(n)} ARR`;
  }

  const sym = currencySymbol(cur);
  if (n >= 1_000_000_000) return `${sym}${stripZeros(n / 1_000_000_000)}B ARR`;
  if (n >= 1_000_000) return `${sym}${stripZeros(n / 1_000_000)}M ARR`;
  if (n >= 1_000) return `${sym}${stripZeros(n / 1_000)}K ARR`;
  return `${sym}${stripZeros(n)} ARR`;
}

function stripZeros(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return Number(n.toFixed(1)).toString();
}

function currencySymbol(iso: string): string {
  switch (iso) {
    case "INR":
      return "₹";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "JPY":
      return "¥";
    default:
      return `${iso} `;
  }
}

/**
 * Best-effort parse of a free-text revenue display ("₹2.1Cr ARR", "$21.0M") into
 * `{ amount, currency }`. Returns null when the string doesn't match.
 *
 * Used by the migration backfill (matching SQL regex) and by the form when a
 * user pastes a value into the display field with no numeric amount.
 */
export function parseRevenueDisplay(input: string | null | undefined): {
  amount: number;
  currency: string;
} | null {
  if (!input) return null;
  const symbolMatch = /[₹$€£¥]/.exec(input);
  const numberMatch = /(\d+(?:\.\d+)?)\s*([KkLlMmCcBb][Rr]?)/.exec(input);
  if (!numberMatch) return null;
  const num = Number(numberMatch[1]);
  if (!Number.isFinite(num)) return null;

  const unit = numberMatch[2].toLowerCase();
  let multiplier = 1;
  switch (unit) {
    case "k":
      multiplier = 1_000;
      break;
    case "l":
    case "lr":
      multiplier = INR_LAKH;
      break;
    case "m":
      multiplier = 1_000_000;
      break;
    case "cr":
    case "c":
      multiplier = INR_CRORE;
      break;
    case "b":
      multiplier = 1_000_000_000;
      break;
  }

  let currency = "INR";
  if (symbolMatch) {
    switch (symbolMatch[0]) {
      case "₹":
        currency = "INR";
        break;
      case "$":
        currency = "USD";
        break;
      case "€":
        currency = "EUR";
        break;
      case "£":
        currency = "GBP";
        break;
      case "¥":
        currency = "JPY";
        break;
    }
  } else if (unit === "l" || unit === "cr" || unit === "c") {
    // Lakhs / crores are India-specific; default INR.
    currency = "INR";
  }

  return { amount: num * multiplier, currency };
}

// =====================================================
// Segment + industry helpers (P2.2)
// =====================================================

const SEGMENT_LABEL: Record<string, string> = {
  Enterprise: "Enterprise",
  MidMarket: "Mid-market",
  SMB: "SMB",
};

export function segmentEnumToLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return SEGMENT_LABEL[value] ?? null;
}

/** Industry → slug ("Healthcare devices" → "healthcare-devices"). */
export function slugifyIndustry(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return v || null;
}

// =====================================================
// Owner-name derivation (P2.7)
// =====================================================

/**
 * Look up the public.User row for `userId` and return "first last" trimmed.
 * Returns null when the user doesn't exist (don't throw — owner can be re-set later).
 */
export async function deriveOwnerName(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, email: true },
  });
  if (!u) return null;
  const composed = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return composed || u.email || null;
}

// =====================================================
// Parent / hierarchy (P2.4)
// =====================================================

/**
 * Walk the parent chain to detect a self-cycle.
 * Throws a 400-ish error if `parentAccountId` would create a loop.
 *
 * Bounded loop (depth 50) so a corrupt chain doesn't hang the request.
 */
export async function assertNoParentCycle(
  orgId: string,
  accountId: string,
  parentAccountId: string | null | undefined,
): Promise<void> {
  if (!parentAccountId) return;
  if (parentAccountId === accountId) {
    throwBadRequest("parentAccountId cannot reference the same account");
  }
  let cursor: string | null = parentAccountId;
  for (let i = 0; i < 50 && cursor; i++) {
    if (cursor === accountId) {
      throwBadRequest("parentAccountId would create a hierarchy cycle");
    }
    const next: { parentAccountId: string | null } | null =
      await prisma.qceAccount.findFirst({
        where: { id: cursor, orgId },
        select: { parentAccountId: true },
      });
    if (!next) return;
    cursor = next.parentAccountId;
  }
}

function throwBadRequest(message: string): never {
  const err = new Error(message) as Error & { statusCode?: number };
  err.statusCode = 400;
  throw err;
}

// =====================================================
// Audit (P2.12)
// =====================================================

interface ActivityWriteParams {
  orgId: string;
  accountId: string;
  accountName: string;
  outcome: string;
  ownerName: string | null;
}

/** Write one QceActivity row of type "AccountChange" describing a change. */
export async function writeAccountActivity(p: ActivityWriteParams): Promise<void> {
  await prisma.qceActivity.create({
    data: {
      orgId: p.orgId,
      type: "AccountChange",
      relatedKind: "Account",
      relatedObjectId: p.accountId,
      subject: `Account · ${p.accountName}`,
      outcome: p.outcome,
      ownerName: p.ownerName,
      occurredAt: new Date(),
    },
  });
}

// =====================================================
// Advanced-filter WHERE builder (Phase 1.5: findWithFilters)
// =====================================================

const ALLOWED_FILTER_FIELDS = new Set<string>([
  "name",
  "segment",
  "segmentEnum",
  "ownerId",
  "ownerName",
  "industry",
  "industryKey",
  "website",
  "city",
  "status",
  "annualRevenueAmount",
  "annualRevenueCurrency",
  "countryCode",
  "state",
  "postalCode",
  "healthScore",
  "npsScore",
  "renewalDate",
  "contractStart",
  "contractEnd",
  "createdAt",
  "updatedAt",
  "parentAccountId",
  "tags",
]);

interface RawCondition {
  field: string;
  operator: string;
  value?: unknown;
  values?: unknown[];
}

const ACCOUNT_DATE_FIELDS = new Set<string>([
  "renewalDate",
  "contractStart",
  "contractEnd",
  "createdAt",
  "updatedAt",
]);

const ACCOUNT_INSENSITIVE_EQ_FIELDS = new Set<string>([
  "name",
  "segment",
  "segmentEnum",
  "ownerName",
  "industry",
  "website",
  "city",
  "state",
  "countryCode",
  "status",
  "annualRevenueCurrency",
]);

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

/** Translate an advanced-filter DTO into a Prisma `where` fragment. */
export function buildAdvancedAccountWhere(
  conditions: RawCondition[],
  combinator: "AND" | "OR",
): Prisma.QceAccountWhereInput | null {
  const built: Prisma.QceAccountWhereInput[] = [];
  for (const c of conditions) {
    if (!ALLOWED_FILTER_FIELDS.has(c.field)) continue;
    const fragment = buildSingleCondition(c);
    if (fragment) built.push(fragment);
  }
  if (built.length === 0) return null;
  return combinator === "OR" ? { OR: built } : { AND: built };
}

function buildSingleCondition(c: RawCondition): Prisma.QceAccountWhereInput | null {
  const { field, operator } = c;

  if (field === "tags") {
    const tag = String(c.value ?? "").trim();
    if (!tag) return null;
    if (operator === "eq" || operator === "contains") {
      return { tags: { has: tag } };
    }
    if (operator === "ne") {
      return { NOT: { tags: { has: tag } } };
    }
    return null;
  }

  if (ACCOUNT_DATE_FIELDS.has(field)) {
    switch (operator) {
      case "eq": {
        const d = parseFilterDate(c.value);
        if (!d) return null;
        return { [field]: { gte: startOfDay(d), lte: endOfDay(d) } } as Prisma.QceAccountWhereInput;
      }
      case "gt": {
        const d = parseFilterDate(c.value);
        if (!d) return null;
        return { [field]: { gt: endOfDay(d) } } as Prisma.QceAccountWhereInput;
      }
      case "gte": {
        const d = parseFilterDate(c.value);
        if (!d) return null;
        return { [field]: { gte: startOfDay(d) } } as Prisma.QceAccountWhereInput;
      }
      case "lt": {
        const d = parseFilterDate(c.value);
        if (!d) return null;
        return { [field]: { lt: startOfDay(d) } } as Prisma.QceAccountWhereInput;
      }
      case "lte": {
        const d = parseFilterDate(c.value);
        if (!d) return null;
        return { [field]: { lte: endOfDay(d) } } as Prisma.QceAccountWhereInput;
      }
      case "between": {
        if (!Array.isArray(c.values) || c.values.length !== 2) return null;
        const a = parseFilterDate(c.values[0]);
        const b = parseFilterDate(c.values[1]);
        if (!a || !b) return null;
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        return {
          [field]: { gte: startOfDay(lo), lte: endOfDay(hi) },
        } as Prisma.QceAccountWhereInput;
      }
      default:
        return null;
    }
  }

  switch (operator) {
    case "eq":
      if (ACCOUNT_INSENSITIVE_EQ_FIELDS.has(field) && typeof c.value === "string") {
        return {
          [field]: { equals: c.value, mode: "insensitive" },
        } as Prisma.QceAccountWhereInput;
      }
      return { [field]: c.value } as Prisma.QceAccountWhereInput;
    case "ne":
      if (ACCOUNT_INSENSITIVE_EQ_FIELDS.has(field) && typeof c.value === "string") {
        return {
          NOT: { [field]: { equals: c.value, mode: "insensitive" } },
        } as Prisma.QceAccountWhereInput;
      }
      return { NOT: { [field]: c.value } } as Prisma.QceAccountWhereInput;
    case "contains":
      return {
        [field]: { contains: String(c.value ?? ""), mode: "insensitive" },
      } as Prisma.QceAccountWhereInput;
    case "startsWith":
      return {
        [field]: { startsWith: String(c.value ?? ""), mode: "insensitive" },
      } as Prisma.QceAccountWhereInput;
    case "endsWith":
      return {
        [field]: { endsWith: String(c.value ?? ""), mode: "insensitive" },
      } as Prisma.QceAccountWhereInput;
    case "in":
      return { [field]: { in: c.values ?? [] } } as Prisma.QceAccountWhereInput;
    case "notIn":
      return { [field]: { notIn: c.values ?? [] } } as Prisma.QceAccountWhereInput;
    case "gt":
      return { [field]: { gt: c.value } } as Prisma.QceAccountWhereInput;
    case "gte":
      return { [field]: { gte: c.value } } as Prisma.QceAccountWhereInput;
    case "lt":
      return { [field]: { lt: c.value } } as Prisma.QceAccountWhereInput;
    case "lte":
      return { [field]: { lte: c.value } } as Prisma.QceAccountWhereInput;
    case "between":
      if (!Array.isArray(c.values) || c.values.length !== 2) return null;
      return {
        [field]: { gte: c.values[0], lte: c.values[1] },
      } as Prisma.QceAccountWhereInput;
    case "isNull":
      return { [field]: null } as Prisma.QceAccountWhereInput;
    case "notNull":
      return { NOT: { [field]: null } } as Prisma.QceAccountWhereInput;
    default:
      return null;
  }
}

// =====================================================
// Row mapper — keeps API responses stable across schema growth
// =====================================================

export interface AccountRow {
  id: string;
  name: string;
  segment: string;
  segmentEnum: string | null;
  owner: string;
  ownerId: string | null;
  annualRevenue: string;
  annualRevenueAmount: number | null;
  annualRevenueCurrency: string | null;
  status: string;
  industry: string;
  industryKey: string | null;
  website: string;
  city: string;
  countryCode: string | null;
  state: string | null;
  postalCode: string | null;
  parentAccountId: string | null;
  healthScore: number | null;
  npsScore: number | null;
  contractStart: string | null;
  contractEnd: string | null;
  renewalDate: string | null;
  tags: string[];
  defaultPriceListId: string | null;
  deletedAt: string | null;
}

/** Shared row-mapper. Mirrors the Nest backend's `toRow()`. */
export function toAccountRow(d: {
  id: string;
  name: string;
  segment: string | null;
  segmentEnum: string | null;
  ownerId: string | null;
  ownerName: string | null;
  annualRevenueDisplay: string | null;
  annualRevenueAmount: Prisma.Decimal | null;
  annualRevenueCurrency: string | null;
  status: string | null;
  industry: string | null;
  industryKey: string | null;
  website: string | null;
  city: string | null;
  countryCode: string | null;
  state: string | null;
  postalCode: string | null;
  parentAccountId: string | null;
  healthScore: number | null;
  npsScore: number | null;
  contractStart: Date | null;
  contractEnd: Date | null;
  renewalDate: Date | null;
  tags?: string[] | null;
  defaultPriceListId?: string | null;
  deletedAt: Date | null;
}): AccountRow {
  return {
    id: d.id,
    name: d.name,
    segment: d.segment ?? "",
    segmentEnum: d.segmentEnum,
    owner: d.ownerName ?? "",
    ownerId: d.ownerId,
    annualRevenue: d.annualRevenueDisplay ?? "",
    annualRevenueAmount: d.annualRevenueAmount ? Number(d.annualRevenueAmount.toString()) : null,
    annualRevenueCurrency: d.annualRevenueCurrency,
    status: d.status ?? "",
    industry: d.industry ?? "",
    industryKey: d.industryKey,
    website: d.website ?? "",
    city: d.city ?? "",
    countryCode: d.countryCode,
    state: d.state,
    postalCode: d.postalCode,
    parentAccountId: d.parentAccountId,
    healthScore: d.healthScore,
    npsScore: d.npsScore,
    contractStart: d.contractStart?.toISOString() ?? null,
    contractEnd: d.contractEnd?.toISOString() ?? null,
    renewalDate: d.renewalDate?.toISOString() ?? null,
    tags: d.tags ?? [],
    defaultPriceListId: d.defaultPriceListId ?? null,
    deletedAt: d.deletedAt?.toISOString() ?? null,
  };
}

export {
  ACCOUNT_ROW_SELECT,
  ACCOUNT_ROW_SELECT_BASE,
  findFirstAccountRow,
  findManyAccountRows,
  updateAccountRow,
  createAccountRow,
} from "@/lib/services/accounts/account-row-fetch";

// =====================================================
// Active (non-trashed) WHERE base + scope merge
// =====================================================

/** Wraps `where` with `deletedAt: null` plus optional ACL scope. Use everywhere. */
export function applyAccountListWhere(
  base: Prisma.QceAccountWhereInput,
  options: {
    trashed?: boolean;
    allowedAccountIds?: string[] | null; // null = unrestricted
    viewMine?: { ownerId: string } | null;
  },
): Prisma.QceAccountWhereInput {
  const where: Prisma.QceAccountWhereInput = { ...base };
  where.deletedAt = options.trashed ? { not: null } : null;
  if (options.allowedAccountIds !== null && options.allowedAccountIds !== undefined) {
    where.id = { in: options.allowedAccountIds };
  }
  if (options.viewMine) {
    where.ownerId = options.viewMine.ownerId;
  }
  return where;
}

// =====================================================
// Permission helpers — small wrappers used by the routes
// =====================================================

/** True when the caller has admin role (used by trash view + reconcile endpoint). */
export function isAdmin(user: SessionUser): boolean {
  return user.role === "Administrator";
}
