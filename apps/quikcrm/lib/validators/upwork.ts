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

/**
 * Conversation extracted from an Upwork Messages room, posted by the extension
 * AFTER the user confirmed which captured job it belongs to.
 *
 * The job is addressed by the route path (/api/upwork/[id]/conversation), never
 * by anything inside this body — so a mis-scrape cannot re-target the write.
 *
 * Every descriptive field is optional because Upwork does not render all of them
 * in every room; the extension sends null rather than guessing. `messages[].id`
 * and `messages[].text` are the two exceptions: without an id there is no dedupe
 * key, and an empty message is not worth a timeline row.
 */
export const upworkConversationSchema = z.object({
  threadId: z.string().trim().max(200).optional().nullable(),
  conversationUrl: z.string().trim().max(2000).optional().nullable(),
  clientName: z.string().trim().max(200).optional().nullable(),
  messages: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(300),
        text: z.string().trim().min(1).max(5000),
        senderName: z.string().trim().max(200).optional().nullable(),
        senderType: z.enum(["client", "user"]).optional().nullable(),
        sentAt: z.string().datetime().optional().nullable(),
        order: z.number().int().min(0).optional().nullable(),
      }),
    )
    .min(1, "A conversation must contain at least one message")
    // Bounded so one runaway scrape cannot write thousands of rows in a single
    // request; the panel reports when it had to cap.
    .max(500),
});

export type UpworkConversationInput = z.infer<typeof upworkConversationSchema>;

/**
 * Submitted-proposal data scraped from /nx/proposals/{proposalId}, posted by the
 * extension AFTER the user confirmed which captured job it belongs to.
 *
 * The job is addressed by the route path, never by anything in this body, so a
 * mis-scrape cannot re-target the write.
 *
 * Connects are `.int()` and non-negative, and every field is optional: Upwork
 * does not render all of them on every proposal. The extension sends null rather
 * than guessing — in particular it NEVER falls back to the listing's
 * `requiredConnects`, and null must stay distinguishable from a real 0.
 */
export const upworkProposalSchema = z.object({
  proposalId: z.string().trim().min(1).max(200),
  proposalSubmittedAt: z.string().datetime().optional().nullable(),
  /** Connects actually consumed by this proposal. */
  connectsUsed: z.number().int().min(0).max(10_000).optional().nullable(),
  /** Extra Connects spent on Boost, when Upwork shows it as its own line. */
  boostConnects: z.number().int().min(0).max(10_000).optional().nullable(),
  /**
   * The cover letter as submitted, scraped from the proposal page.
   *
   * NOT run through `scrapedText()` like the job-listing fields: that helper
   * trims and collapses an empty string to undefined, and its length caps are
   * tuned for single-line values. A cover letter's paragraph breaks, blank lines
   * and bullet lines are the content, so only the outer whitespace is trimmed
   * and the interior is stored verbatim. Empty/whitespace-only becomes null
   * rather than an empty string — "no cover letter" is an absence, not a value.
   */
  proposalCoverLetter: z
    .string()
    .max(50_000)
    .optional()
    .nullable()
    .transform((v) => {
      if (v === undefined || v === null) return v;
      const trimmed = v.trim();
      return trimmed === "" ? null : trimmed;
    }),
});

export type UpworkProposalInput = z.infer<typeof upworkProposalSchema>;
