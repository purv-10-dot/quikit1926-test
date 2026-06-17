/**
 * Account validators — Zod schemas for create/update/list/filter.
 *
 * Mirrors the Nest backend's `create-account.dto.ts` (validation-constants
 * ACCOUNT_STATUS, MaxLength caps) and adds the Phase 2 fields:
 * numeric revenue, segment enum, industry slug, address, hierarchy,
 * health/NPS/contract dates, soft-delete.
 *
 * `ownerName` is intentionally NOT exposed on create/update — it's derived
 * server-side from `ownerId` by deriveOwnerName() to prevent drift.
 * (See P2.7 in the rebuild spec.)
 */
import { z } from "zod";
import { pageSchema, pageSizeSchema } from "@/lib/validators/pagination";

export const ACCOUNT_STATUS = ["Active", "Prospect", "Inactive"] as const;
export const ACCOUNT_SEGMENT_ENUM = ["Enterprise", "MidMarket", "SMB"] as const;

const trimmedNullable = z.string().trim().optional().nullable();
const websiteSchema = z
  .string()
  .trim()
  .max(300)
  .refine(
    (v) =>
      !v ||
      // require_tld:false — allow "intranet" / "localhost". Just sanity-check shape.
      /^(https?:\/\/)?[\w.-]+\.[\w.-]+|^https?:\/\/(localhost|[\w-]+)(:\d+)?(\/.*)?$/i.test(v),
    { message: "website must be a valid URL" },
  )
  .optional()
  .nullable();

/** Plain shape — we re-derive `partial()` for update so the superRefine doesn't fire on optional patches. */
const baseAccountFields = z.object({
  name: z.string().trim().min(1).max(300),
  segment: z.string().trim().max(120).optional().nullable(),
  segmentEnum: z.enum(ACCOUNT_SEGMENT_ENUM).optional().nullable(),
  ownerId: z.string().trim().min(1).optional().nullable(),
  industry: z.string().trim().max(120).optional().nullable(),
  website: websiteSchema,
  city: z.string().trim().max(120).optional().nullable(),
  status: z.enum(ACCOUNT_STATUS).optional(),
  annualRevenueDisplay: z.string().trim().max(120).optional().nullable(),

  // P2.1
  annualRevenueAmount: z.coerce.number().nonnegative().optional().nullable(),
  annualRevenueCurrency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, { message: "currency must be ISO 4217 (e.g. INR, USD)" })
    .optional()
    .nullable(),

  // P2.3 address
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/, { message: "countryCode must be ISO 3166-1 alpha-2" })
    .optional()
    .nullable(),
  state: trimmedNullable,
  postalCode: trimmedNullable,

  // P2.4 hierarchy
  parentAccountId: z.string().trim().min(1).optional().nullable(),

  // P2.6 health / contract / NPS
  healthScore: z.coerce.number().int().min(0).max(100).optional().nullable(),
  contractStart: z.coerce.date().optional().nullable(),
  contractEnd: z.coerce.date().optional().nullable(),
  renewalDate: z.coerce.date().optional().nullable(),
  npsScore: z.coerce.number().int().min(-100).max(100).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  defaultPriceListId: z.string().trim().min(1).optional().nullable(),
});

export const createAccountSchema = baseAccountFields;
export const updateAccountSchema = baseAccountFields.partial();

export const listAccountsQuerySchema = z.object({
  search: z.string().optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
  trashed: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "true"),
  /** Saved view tile: "all" | "mine". Default "all". */
  view: z.enum(["all", "mine"]).optional().default("all"),
});

/**
 * Advanced filter — mirrors the Nest backend's AdvancedFilterDto shape.
 * Conditions are AND'd unless `combinator` is set to "OR".
 *
 * Keep the operator list aligned with the leads filter engine so the
 * frontend's AdvancedFilterModal can stay generic.
 */
const filterCondition = z.object({
  field: z.string().min(1),
  operator: z.enum([
    "eq",
    "ne",
    "contains",
    "startsWith",
    "endsWith",
    "in",
    "notIn",
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
    "isNull",
    "notNull",
  ]),
  value: z.unknown().optional(),
  values: z.array(z.unknown()).optional(),
});

export const filterAccountsSchema = z.object({
  conditions: z.array(filterCondition).default([]),
  combinator: z.enum(["AND", "OR"]).default("AND"),
  page: pageSchema,
  pageSize: pageSizeSchema,
  /** Toolbar search — AND'd with advanced conditions (same fields as GET ?search=). */
  search: z.string().optional(),
  /** Top-level only — `parentAccountId IS NULL`. Mutually independent of conditions. */
  topLevelOnly: z.boolean().optional(),
});

export const bulkAssignLeadsSchema = z.object({
  leadIds: z.array(z.string().trim().min(1)).min(1).max(500),
  ownerId: z.string().trim().min(1),
});

export const healthSummaryQuerySchema = z.object({
  ownerId: z.string().trim().optional(),
  segment: z.enum(ACCOUNT_SEGMENT_ENUM).optional(),
  healthLt: z.coerce.number().int().min(0).max(100).optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type ListAccountsQuery = z.infer<typeof listAccountsQuerySchema>;
export type FilterAccountsInput = z.infer<typeof filterAccountsSchema>;
export type BulkAssignLeadsInput = z.infer<typeof bulkAssignLeadsSchema>;
export type HealthSummaryQuery = z.infer<typeof healthSummaryQuerySchema>;
