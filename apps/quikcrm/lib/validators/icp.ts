/**
 * ICP (Ideal Customer Profile) validation schemas.
 *
 * Mirrors the contract used by the other master modules (see
 * lib/services/quotes/validators.ts): list schemas spread the canonical
 * pagination fields, create schemas are explicit, update schemas are
 * `.partial().strict()` so an unknown key is a 400 rather than a silent no-op.
 */

import { z } from "zod";
import { pageSchema, pageSizeSchema } from "@/lib/validators/pagination";

/** Mirrors the CrmIcpTaxonomyKind Prisma enum. */
export const icpTaxonomyKindSchema = z.enum(["Industry", "Vertical", "Technology"]);
export type IcpTaxonomyKind = z.infer<typeof icpTaxonomyKindSchema>;

/** Mirrors CrmAccountSegment — reused so ICP and Account speak one vocabulary. */
export const icpSegmentSchema = z.enum(["Enterprise", "MidMarket", "SMB"]);

const cuid = z.string().min(1);

/** ISO-3166 alpha-2, upper-cased so "in" and "IN" don't both persist. */
const countryCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/u, "Must be a 2-letter country code")
  .transform((v) => v.toUpperCase());

// ─── ICP profile ─────────────────────────────────────────────────────────────

const icpProfileBase = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  personaNotes: z.string().trim().max(4000).optional().nullable(),
  segment: icpSegmentSchema.optional().nullable(),
  employeeCountMin: z.number().int().min(0).max(10_000_000).optional().nullable(),
  employeeCountMax: z.number().int().min(0).max(10_000_000).optional().nullable(),
  annualRevenueMin: z.number().min(0).optional().nullable(),
  annualRevenueMax: z.number().min(0).optional().nullable(),
  revenueCurrency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/u, "Must be a 3-letter currency code")
    .optional()
    .nullable(),
  countryCodes: z.array(countryCode).max(50).optional(),
  regions: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  isActive: z.boolean().optional(),
  /** Linked master rows. Replace-on-write: the array sent IS the new set. */
  taxonomyIds: z.array(cuid).max(200).optional(),
  productIds: z.array(cuid).max(200).optional(),
  accountIds: z.array(cuid).max(200).optional(),
});

/**
 * Min/max coherence. Checked as a refinement rather than in the service so the
 * error lands in `fieldErrors` and the form can render it under the right input.
 */
function withRangeChecks<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((val, ctx) => {
    const v = val as z.infer<typeof icpProfileBase>;
    if (
      v.employeeCountMin != null &&
      v.employeeCountMax != null &&
      v.employeeCountMin > v.employeeCountMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["employeeCountMax"],
        message: "Max employees must be greater than or equal to min",
      });
    }
    if (
      v.annualRevenueMin != null &&
      v.annualRevenueMax != null &&
      v.annualRevenueMin > v.annualRevenueMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["annualRevenueMax"],
        message: "Max revenue must be greater than or equal to min",
      });
    }
  });
}

export const createIcpProfileSchema = withRangeChecks(icpProfileBase);
export const updateIcpProfileSchema = withRangeChecks(icpProfileBase.partial().strict());

export type CreateIcpProfileInput = z.infer<typeof createIcpProfileSchema>;
export type UpdateIcpProfileInput = z.infer<typeof updateIcpProfileSchema>;

export const listIcpProfilesQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  q: z.string().trim().optional(),
  segment: icpSegmentSchema.optional(),
  /** Filter to ICPs linked to this taxonomy row (industry/vertical/technology). */
  taxonomyId: z.string().trim().optional(),
  kind: icpTaxonomyKindSchema.optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : v === "true")),
  trashed: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  sortBy: z.enum(["updatedAt", "createdAt", "name"]).default("updatedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

// ─── ICP taxonomy master ─────────────────────────────────────────────────────

export const createIcpTaxonomySchema = z.object({
  kind: icpTaxonomyKindSchema,
  name: z.string().trim().min(1, "Name is required").max(160),
  code: z.string().trim().max(64).optional().nullable(),
  parentId: cuid.optional().nullable(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  isActive: z.boolean().optional(),
});

/**
 * `kind` is intentionally NOT updatable: rows are already linked to profiles
 * with a denormalised `kind`, and flipping it would desync those links.
 */
export const updateIcpTaxonomySchema = createIcpTaxonomySchema
  .omit({ kind: true })
  .partial()
  .strict();

export const listIcpTaxonomyQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  q: z.string().trim().optional(),
  kind: icpTaxonomyKindSchema.optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : v === "true")),
});

/** Unpaginated picker feed for the ICP form's multi-selects. */
export const icpTaxonomyOptionsQuerySchema = z.object({
  kind: icpTaxonomyKindSchema.optional(),
});
