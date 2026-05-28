import { z } from "zod";

/**
 * Distribution shape — drives the row balance/validation matrix in OPSP modals.
 * Replaces the legacy single-axis "breakdownType" enum which conflated this
 * with the fill mode. See OPSP-CHANGES.md §1 for the rationale.
 */
const categoryTypeEnum = z.enum(["Cumulative", "CumulativeTillEnd", "Standalone"]);

/**
 * Fill mode — Automatic lets `calculateBreakdown` distribute Projected across
 * periods; Manual requires the user to enter every cell themselves.
 */
const breakdownTypeEnum = z.enum(["Manual", "Automatic"]);

// String length caps on user-content fields (name/description) lifted —
// Prisma columns are `text`. `currency.max(10)` kept as a format guard
// (ISO 4217 currency codes are 3 chars; 10 is generous but still rejects free text).
export const createCategorySchema = z.object({
  name: z.string().min(1, "Category name is required"),
  dataType: z.enum(["Number", "Percentage", "Currency"]),
  currency: z.string().max(10).optional().nullable(),
  description: z.string().optional().nullable(),
  /// Two-axis category metadata — both fields drive OPSP modal behaviour.
  categoryType: categoryTypeEnum.optional(),
  breakdownType: breakdownTypeEnum.optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  dataType: z.enum(["Number", "Percentage", "Currency"]).optional(),
  currency: z.string().max(10).optional().nullable(),
  description: z.string().optional().nullable(),
  categoryType: categoryTypeEnum.optional(),
  breakdownType: breakdownTypeEnum.optional(),
});

export type CategoryType = z.infer<typeof categoryTypeEnum>;
export type BreakdownTypeMode = z.infer<typeof breakdownTypeEnum>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
