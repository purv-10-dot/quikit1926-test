import { z } from "zod";

/**
 * OPSP autosave validation.
 *
 * The OPSP form is a large JSON blob (see `app/(dashboard)/opsp/page.tsx`
 * `FormData` interface). Most fields are `Json?` columns in Prisma, so we
 * intentionally keep the schema PERMISSIVE for those — we only enforce the
 * primary keys (year, quarter) that the upsert where-clause depends on.
 *
 * If/when OPSP is decomposed (code-analysis.md §6.2), tighten the schema by
 * moving the `FormData` interface from page.tsx into shared types and using
 * it here.
 */
export const opspUpsertSchema = z
  .object({
    year: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
    quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
  })
  .passthrough(); // allow all other FormData fields through unchanged

/** POST /api/opsp (finalize) — only year + quarter. */
export const opspFinalizeSchema = z.object({
  year: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
});

export type OpspUpsertInput = z.infer<typeof opspUpsertSchema>;
export type OpspFinalizeInput = z.infer<typeof opspFinalizeSchema>;
