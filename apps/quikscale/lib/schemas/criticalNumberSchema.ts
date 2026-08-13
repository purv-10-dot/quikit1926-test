import { z } from "zod";
import { MAX_VALUE_DECIMALS, hasMaxDecimalPlaces } from "@/lib/utils/decimalPrecision";

/**
 * Validation for Critical Numbers (v2).
 *
 * v1's two-mode model (custom thresholds vs date-based pacing) is gone. A
 * Critical Number is now a single always-on shape: a categorised metric with a
 * unit, a cadence and a target, scored on KPI's percentage bands.
 */

/**
 * Deliberately NOT KPI's enum: KPI (lib/schemas/kpiSchema.ts) also offers
 * "Ratio", which Critical Numbers does not — dropped product-side, so this
 * list is intentionally one shorter. KPI keeps its own copy, unaffected.
 *
 * It also happens to remove the only measurement unit CategoryMaster's
 * `dataType` had no equivalent for, so inline "+ New Category" now works for
 * every unit a Critical Number can have.
 */
export const MEASUREMENT_UNITS = ["Number", "Percentage", "Currency"] as const;
export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

/**
 * Intentionally NOT KPI's list (daily/weekly/monthly/yearly) — Critical Numbers
 * are reviewed on a different cadence. Confirmed product-side, not an oversight.
 */
export const CRITICAL_NUMBER_FREQUENCIES = ["weekly", "monthly", "quarterly"] as const;
export type CriticalNumberFrequency = (typeof CRITICAL_NUMBER_FREQUENCIES)[number];

/** Max Critical Numbers per team ("Department" in the UI). Enforced server-side. */
export const MAX_CRITICAL_NUMBERS_PER_TEAM = 5;

/**
 * Shared by the Target Value and by each recorded reading: at most 2 decimals.
 *
 * The inputs already refuse a 3rd decimal digit as it's typed, but this is not
 * a mirror of that — it's the independent enforcement point, so a direct API
 * call (script, integration, curl) is held to the same rule as the form.
 */
const MAX_DECIMALS_ISSUE = {
  message: `Use at most ${MAX_VALUE_DECIMALS} decimal places`,
};

const baseFields = {
  title: z.string().trim().min(1, "Title is required").max(200, "Title is too long"),
  // Explicit, never derived: a user can belong to several teams, and the
  // per-team cap needs an unambiguous anchor. Surfaced as "Department".
  teamId: z.string().min(1, "Department is required"),
  ownerId: z.string().min(1, "Owner is required"),
  categoryId: z.string().min(1, "Category is required"),
  subCategoryId: z.string().min(1).nullable().optional(),
  measurementUnit: z.enum(MEASUREMENT_UNITS),
  /**
   * Unit Master label. Only meaningful for Number metrics — the API force-nulls
   * it otherwise, the same rule KPI applies. Stored as a plain string, not an
   * FK, exactly as KPI.unit is.
   */
  unit: z.string().trim().max(60).nullable().optional(),
  /**
   * ISO 4217 code ("USD", "INR", …). Same shape as KPI.currency — plain
   * string, no enum. Required whenever measurementUnit is "Currency" (see the
   * `.refine()` below) — force-nulled by the API otherwise, the same rule as
   * `unit` above.
   */
  currency: z.string().optional().nullable(),
  /**
   * K/L/Cr/M display-scale label ("Crore", "Million", …), same shape as
   * KPI.targetScale. Optional even for Currency metrics — unlike `currency`,
   * "no scale" is a valid, meaningful choice (show the full raw number).
   * Force-nulled by the API for non-Currency metrics.
   */
  targetScale: z.string().optional().nullable(),
  frequency: z.enum(CRITICAL_NUMBER_FREQUENCIES),
  /** Required: the percentage bands are meaningless without a denominator. */
  targetValue: z
    .number()
    .finite("Target must be a number")
    .refine((v) => hasMaxDecimalPlaces(v), MAX_DECIMALS_ISSUE),
};

/**
 * Currency is required exactly when measurementUnit is "Currency" — the type
 * selector alone isn't a complete answer without knowing WHICH currency.
 * `targetScale` deliberately has no such rule: leaving it unset just means
 * "show the raw number," which is a legitimate choice, not an incomplete one.
 */
function requiresCurrency(d: { measurementUnit: MeasurementUnit; currency?: string | null }) {
  return d.measurementUnit !== "Currency" || !!d.currency;
}
const CURRENCY_REQUIRED_ISSUE = {
  message: "Currency is required when Measurement Unit is Currency",
  path: ["currency"] as (string | number)[],
};

export const createCriticalNumberSchema = z
  .object(baseFields)
  .refine(requiresCurrency, CURRENCY_REQUIRED_ISSUE);
export type CreateCriticalNumberInput = z.infer<typeof createCriticalNumberSchema>;

/**
 * Update. Every field optional so a partial PATCH works; the route merges
 * against the stored row before re-validating team/owner/category coherence.
 *
 * The `.refine()` here only catches an EXPLICIT contradiction in the same
 * request (measurementUnit set to "Currency" while currency is explicitly
 * cleared) — it can't see the stored row, so it can't catch e.g. "PATCH just
 * flips measurementUnit to Currency, currency omitted, existing row has none
 * either." That full cross-field check happens in the PUT handler against the
 * merged (existing + incoming) state, same division of labour KPI's own
 * `updateKPISchema` documents for its own partial-update refine.
 */
export const updateCriticalNumberSchema = z
  .object({
    title: baseFields.title.optional(),
    teamId: baseFields.teamId.optional(),
    ownerId: baseFields.ownerId.optional(),
    categoryId: baseFields.categoryId.optional(),
    subCategoryId: baseFields.subCategoryId,
    measurementUnit: z.enum(MEASUREMENT_UNITS).optional(),
    unit: baseFields.unit,
    currency: baseFields.currency,
    targetScale: baseFields.targetScale,
    frequency: z.enum(CRITICAL_NUMBER_FREQUENCIES).optional(),
    // Reuses the create field rather than redeclaring it, so the decimal rule
    // cannot drift between POST and PATCH.
    targetValue: baseFields.targetValue.optional(),
  })
  .refine((d) => !(d.measurementUnit === "Currency" && d.currency === null), CURRENCY_REQUIRED_ISSUE);
export type UpdateCriticalNumberInput = z.infer<typeof updateCriticalNumberSchema>;

/**
 * A single append-only history entry. `date` is the date the value is recorded
 * FOR (may be backdated), distinct from the row's insert time.
 */
export const createCriticalNumberUpdateSchema = z.object({
  date: z
    .string()
    .datetime()
    /**
     * No future readings. `currentValue` is recomputed as the LATEST row by
     * date, so a future-dated entry took over the gauge immediately and held it
     * until real time caught up — a mistyped year silently froze the metric.
     *
     * The bound is the end of the current UTC day, not `now`: the client posts
     * UTC midnight for the chosen calendar day, so "today" must stay valid.
     * A user far enough ahead of UTC can have their local "today" already be
     * tomorrow in UTC and see this rejection; the message says which date was
     * refused so that's diagnosable rather than mysterious.
     */
    .refine(
      (iso) => {
        const endOfTodayUtc = new Date();
        endOfTodayUtc.setUTCHours(23, 59, 59, 999);
        return new Date(iso).getTime() <= endOfTodayUtc.getTime();
      },
      { message: "That date is in the future — record a reading for today or earlier." },
    ),
  // Same 2-decimal rule as the Target Value it gets scored against — a reading
  // is entered in the same terms as its target, so it obeys the same precision.
  value: z.number().finite().refine((v) => hasMaxDecimalPlaces(v), MAX_DECIMALS_ISSUE),
  comment: z.string().trim().max(1000, "Comment is too long").nullable().optional(),
});
export type CreateCriticalNumberUpdateInput = z.infer<typeof createCriticalNumberUpdateSchema>;

/** Inline "+ New Sub Category" from the create form. */
export const createSubCategorySchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
});
export type CreateSubCategoryInput = z.infer<typeof createSubCategorySchema>;

/**
 * Inline "+ New Category" from the create form.
 *
 * `measurementUnit` now matches MEASUREMENT_UNITS exactly — both are
 * Number/Percentage/Currency, the same set CategoryMaster.dataType offers
 * (categorySchema.ts). Ratio was the one value with no dataType equivalent,
 * and it's gone, so there's no longer a unit this action has to refuse.
 */
export const createCategoryFromCriticalNumberSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name is too long"),
  measurementUnit: z.enum(["Number", "Percentage", "Currency"]),
});
export type CreateCategoryFromCriticalNumberInput = z.infer<
  typeof createCategoryFromCriticalNumberSchema
>;
