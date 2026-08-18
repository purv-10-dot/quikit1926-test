/**
 * Upwork module validation schemas.
 *
 * Mirrors the contract used by the other modules (see lib/validators/icp.ts):
 * list schemas spread the canonical pagination fields, create schemas are
 * explicit, update schemas are `.partial().strict()` so an unknown key is a 400
 * rather than a silent no-op.
 *
 * Every scraped field is a free-text string, deliberately. Upwork renders
 * "$25.00 Hourly", "20 to 50", "Less than 30 hrs/week" — there is no stable
 * public schema behind those, and coercing them to numbers would drop
 * information the moment Upwork changes a label. The browser extension sends
 * exactly what it scraped; normalisation is a later concern.
 */

import { z } from "zod";
import { pageSchema, pageSizeSchema } from "@/lib/validators/pagination";

/** Scraped free-text field: trimmed, length-capped, empty string → undefined. */
const scrapedText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/**
 * Upwork job URLs arrive with tracking query strings and occasionally a
 * fragment. Both are stripped before storage so the same job posted from a
 * search page and from a direct link dedupe to one row.
 */
export const upworkJobUrlSchema = z
  .string()
  .trim()
  .url("Must be a valid URL")
  .max(2000)
  .refine(
    (v) => {
      try {
        return new URL(v).hostname.toLowerCase().endsWith("upwork.com");
      } catch {
        return false;
      }
    },
    { message: "Must be an upwork.com URL" },
  )
  .optional()
  .nullable();

// ─── Create (called by the browser extension's "Add to CRM") ─────────────────

export const createUpworkJobSchema = z.object({
  jobTitle: z.string().trim().min(1, "Job title is required").max(500),
  jobUrl: upworkJobUrlSchema,
  jobDescription: scrapedText(20_000),
  projectType: scrapedText(200),
  /** Comma-joined by the extension; stored as sent. */
  skills: scrapedText(2000),
  clientLocation: scrapedText(300),
  proposals: scrapedText(200),
  reviews: scrapedText(300),
  projectPrice: scrapedText(200),
  projectTime: scrapedText(200),
  requiredConnects: scrapedText(100),
  /**
   * The scraper's untouched output, kept so a field we did not model (or a
   * scraper change) is still recoverable from the row. Capped by the API's JSON
   * body limit rather than a schema rule.
   */
  rawData: z.unknown().optional(),
});

export type CreateUpworkJobInput = z.infer<typeof createUpworkJobSchema>;

// ─── Update (manual edits from the CRM detail screen) ────────────────────────

/**
 * `jobUrl` is intentionally NOT updatable: it feeds `dedupeKey`, and letting it
 * change would let a row silently collide with — or escape — the duplicate
 * guard. Re-adding the job from the extension is the supported path.
 */
export const updateUpworkJobSchema = createUpworkJobSchema
  .omit({ jobUrl: true, rawData: true })
  .partial()
  .strict();

export type UpdateUpworkJobInput = z.infer<typeof updateUpworkJobSchema>;

// ─── AI analysis (written by the extension after the AI chain returns) ───────

/**
 * The AI step is a separate, optional follow-up to capture: the panel shows the
 * result and the user can skip it. So this is its own endpoint rather than part
 * of create, and every field is optional — a partial result is still worth
 * keeping.
 *
 * `analysis` is stored as an opaque blob because its shape is owned by an
 * external service we do not version.
 */
export const upworkAiAnalysisSchema = z.object({
  analysis: z.unknown().optional(),
  score: z.coerce.number().int().min(0).max(100).optional().nullable(),
  confidence: scrapedText(100),
  clientMessage: scrapedText(10_000),
});

export type UpworkAiAnalysisInput = z.infer<typeof upworkAiAnalysisSchema>;

// ─── List ────────────────────────────────────────────────────────────────────

export const listUpworkJobsQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  /** Free-text search across title, description, skills and client location. */
  q: z.string().trim().max(200).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "jobTitle"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  trashed: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export type ListUpworkJobsQuery = z.infer<typeof listUpworkJobsQuerySchema>;
