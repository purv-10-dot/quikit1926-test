/**
 * Shared types + Zod parsing for Global Export query params.
 *
 * Every module export route accepts the same base query shape (format +
 * selected columns) plus a per-module range. Parsing lives here so the routes
 * stay thin and the validation is unit-testable in isolation.
 */
import { z } from "zod";

export type RangeMode = "quarter" | "week" | "date" | "createdDate" | "none";

/** Base params present on every export route. Exports are Excel (.xlsx) only. */
export const exportBaseSchema = z.object({
  /** Comma-separated column keys the user selected. Empty → all columns. */
  columns: z
    .string()
    .optional()
    .transform((s) =>
      (s ?? "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    ),
});

export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

/** Quarter-range params for KPI / Team KPI / Priority: a fiscal year + one or
 *  more quarters (`quarters=Q1` or `quarters=Q1,Q2,Q3,Q4` for full year). */
export const quarterRangeSchema = z.object({
  year: z.coerce.number().int().min(2000).max(3000),
  quarters: z
    .string()
    .optional()
    .transform((s) =>
      (s ?? "")
        .split(",")
        .map((q) => q.trim().toUpperCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(QUARTERS)).min(1)),
});
export type QuarterRangeParams = z.infer<typeof quarterRangeSchema>;

/** Week-range params for KPI / Team KPI / Priority. */
export const weekRangeSchema = z.object({
  fromWeek: z.coerce.number().int().min(1).max(53).default(1),
  toWeek: z.coerce.number().int().min(1).max(53).default(13),
  weekCount: z.coerce.number().int().min(1).max(53).default(13),
});

/** Date-range params for WWW / Daily Huddle / Weekly Meeting. `from`/`to` are
 *  "YYYY-MM-DD"; both optional (open-ended / all-time). */
export const dateRangeSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type ExportBaseParams = z.infer<typeof exportBaseSchema>;
export type WeekRangeParams = z.infer<typeof weekRangeSchema>;
export type DateRangeParams = z.infer<typeof dateRangeSchema>;

/** Read a URLSearchParams into a plain record the schemas can parse. */
export function searchParamsToObject(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of sp.entries()) out[k] = v;
  return out;
}
