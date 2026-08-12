/**
 * Zod schemas for the opportunities module.
 *
 * Centralised here so route handlers stay thin and unit tests can reuse the
 * same schemas. Stage updates are deliberately rejected on `update` — the
 * client must use POST /api/opportunities/[id]/transition.
 */
import { z } from "zod";
import { pageSchema, pageSizeSchema } from "@/lib/validators/pagination";

const STAGE = z.enum([
  "Prospecting",
  "Qualification",
  "Proposal",
  "Negotiation",
  "ClosedWon",
  "ClosedLost",
]);

export const createOpportunitySchema = z.object({
  name: z.string().min(1).max(300),
  accountId: z.string().min(1),
  leadId: z.string().min(1).optional().nullable(),
  stage: STAGE.optional(),
  amount: z.number().nonnegative().optional().nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Use 3-letter ISO 4217 currency codes")
    .optional(),
  probability: z.number().int().min(0).max(100).optional(),
  closeDate: z.string().datetime().optional().nullable(),
  ownerId: z.string().min(1).optional().nullable(),
  priceListId: z.string().min(1).optional().nullable(),
});

export const updateOpportunitySchema = z
  .object({
    name: z.string().min(1).max(300).optional(),
    accountId: z.string().min(1).optional(),
    leadId: z.string().min(1).nullable().optional(),
    amount: z.number().nonnegative().nullable().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    probability: z.number().int().min(0).max(100).optional(),
    closeDate: z.string().datetime().nullable().optional(),
    ownerId: z.string().min(1).nullable().optional(),
    priceListId: z.string().min(1).nullable().optional(),
    competitorName: z.string().nullable().optional(),
    // stage is rejected explicitly — see handler
  })
  .strict();

export const transitionSchema = z.object({
  toStage: STAGE,
  closeReason: z.string().max(2000).optional().nullable(),
  closeReasonCategory: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const clientMeetingSchema = z.object({
  subject: z.string().min(1).max(300),
  meetingAt: z.string().datetime(),
  meetingType: z.string().max(100).optional().nullable(),
  competitorName: z.string().max(200).optional().nullable(),
  outcome: z.string().max(500).optional().nullable(),
  attendees: z.unknown().optional(),
  notes: z.string().max(5000).optional().nullable(),
});

export const productSchema = z.object({
  productName: z.string().min(1).max(200),
  quantity: z.number().int().min(1),
  unitPrice: z.number().nonnegative(),
  discountPct: z.number().int().min(0).max(100).default(0),
  notes: z.string().max(1000).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export const listQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  /** Lead detail tab — fetch all opps for one lead (capped by pageSize allow-list). */
  leadId: z.string().min(1).optional(),
  trashed: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  stage: STAGE.optional(),
  ownerId: z.string().optional(),
  accountId: z.string().optional(),
  q: z.string().optional(),
});

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

/** POST /api/opportunities/filter — paginated list with advanced conditions. */
export const filterOpportunitiesSchema = z.object({
  conditions: z.array(filterCondition).default([]),
  combinator: z.enum(["AND", "OR"]).default("AND"),
  page: pageSchema,
  pageSize: pageSizeSchema,
  /** Toolbar quick search — AND'd with advanced conditions. */
  search: z.string().optional(),
});

/** POST /api/opportunities/pipeline — board with optional filter/search. */
export const pipelineFilterSchema = z.object({
  conditions: z.array(filterCondition).default([]),
  combinator: z.enum(["AND", "OR"]).default("AND"),
  search: z.string().optional(),
});

/** @deprecated Use filterOpportunitiesSchema — kept as alias for existing imports. */
export const filterBodySchema = filterOpportunitiesSchema;
