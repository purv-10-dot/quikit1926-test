/**
 * Zod schemas for the Sales Cost API. Shared by the routes so the request
 * contract lives in one place.
 *
 * Money is bounded (0 … 1e11) rather than merely non-negative: an unbounded
 * amount would overflow Decimal(18,2) at the DB and surface as a 500 instead of
 * a validation error. Percentages are bounded 0.01–100 for the same reason,
 * with the "must sum to <= 100 across overlapping allocations" rule enforced in
 * the service (it needs the other rows to decide).
 */
import { z } from "zod";
import { BILLING_FREQUENCIES } from "@/lib/services/sales-cost/period";

/** Upper bound that safely fits Decimal(18,2). */
const MAX_AMOUNT = 100_000_000_000;

const amount = z
  .number()
  .finite()
  .min(0, "Amount cannot be negative")
  .max(MAX_AMOUNT, "Amount is too large");

/** `YYYY-MM` period key. */
export const periodKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Period must be in YYYY-MM format");

/**
 * A month reference accepted from the client: either `YYYY-MM` or a full ISO
 * date string. Both are snapped to the first of the month in UTC by the
 * service, so the two forms are interchangeable.
 */
const monthRef = z.union([periodKeySchema, z.string().datetime()]);

/** Parse a month reference to a Date. `YYYY-MM` becomes the 1st at UTC midnight. */
export function toMonthDate(v: string): Date {
  return /^\d{4}-\d{2}$/.test(v) ? new Date(`${v}-01T00:00:00.000Z`) : new Date(v);
}

const currency = z.string().trim().length(3, "Currency must be a 3-letter code").toUpperCase();

// ---------------------------------------------------------------------------
// Salary
// ---------------------------------------------------------------------------

export const salaryUpsertSchema = z.object({
  userId: z.string().min(1, "Sales rep is required"),
  monthlyAmount: amount,
  currency: currency.optional(),
  /** The month this salary takes effect from. Defaults to the current month. */
  effectiveFrom: monthRef.optional(),
  notes: z.string().trim().max(1000).nullish(),
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const allocationSchema = z.object({
  userId: z.string().min(1, "Sales rep is required"),
  percentage: z
    .number()
    .finite()
    .gt(0, "Allocation must be greater than 0%")
    .max(100, "Allocation cannot exceed 100%"),
  effectiveFrom: monthRef.optional(),
  effectiveTo: monthRef.nullish(),
});

export const toolCreateSchema = z.object({
  name: z.string().trim().min(1, "Tool name is required").max(200),
  vendor: z.string().trim().max(200).nullish(),
  category: z.string().trim().max(100).nullish(),
  cost: amount,
  billingFrequency: z.enum(BILLING_FREQUENCIES).default("monthly"),
  currency: currency.optional(),
  startDate: monthRef,
  endDate: monthRef.nullish(),
  active: z.boolean().default(true),
  notes: z.string().trim().max(1000).nullish(),
  /** At least one — a tool allocated to nobody charges nobody. */
  allocations: z.array(allocationSchema).min(1, "Assign the tool to at least one sales rep"),
});

/**
 * Tool identity update. Price fields are deliberately ABSENT — cost, billing
 * frequency and currency are versioned on CrmSalesToolPrice and change only via
 * POST /tools/[id]/price, so that editing a tool can never rewrite a past
 * month's cost.
 */
export const toolUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  vendor: z.string().trim().max(200).nullish(),
  category: z.string().trim().max(100).nullish(),
  startDate: monthRef.optional(),
  endDate: monthRef.nullish(),
  active: z.boolean().optional(),
  notes: z.string().trim().max(1000).nullish(),
  /** When present, REPLACES the whole allocation set. */
  allocations: z.array(allocationSchema).min(1).optional(),
});

/**
 * A new price version for a tool, effective from a month onward. Closes the
 * current version rather than editing it, so history is preserved.
 */
export const toolPriceSchema = z.object({
  cost: amount,
  billingFrequency: z.enum(BILLING_FREQUENCIES).default("monthly"),
  currency: currency.optional(),
  /** Month the new price takes effect. Defaults to the current month. */
  effectiveFrom: monthRef.optional(),
  notes: z.string().trim().max(1000).nullish(),
});

// ---------------------------------------------------------------------------
// Other costs
// ---------------------------------------------------------------------------

export const otherCostCreateSchema = z.object({
  userId: z.string().min(1, "Sales rep is required"),
  label: z.string().trim().min(1, "Label is required").max(200),
  monthlyAmount: amount,
  currency: currency.optional(),
  effectiveFrom: monthRef.optional(),
  effectiveTo: monthRef.nullish(),
  active: z.boolean().default(true),
  notes: z.string().trim().max(1000).nullish(),
});

export const otherCostUpdateSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  monthlyAmount: amount.optional(),
  currency: currency.optional(),
  effectiveFrom: monthRef.optional(),
  effectiveTo: monthRef.nullish(),
  active: z.boolean().optional(),
  notes: z.string().trim().max(1000).nullish(),
});
