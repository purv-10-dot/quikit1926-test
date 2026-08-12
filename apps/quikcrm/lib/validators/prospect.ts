/**
 * Prospect validation schemas.
 *
 * Until now prospects were only ever created by the LinkedIn extension, whose
 * validation lives inline in /api/leads/from-linkedin. This is the shared
 * contract for prospects created from the CRM UI (the reusable prospect form,
 * used by the Upwork "Convert to Prospect" flow and available to any future
 * "New Prospect" entry point).
 *
 * Field set matches the CrmProspect columns a human can reasonably fill in;
 * the scraped JSON blobs (posts / companyData / experiences) are deliberately
 * NOT accepted here — those are extension-owned.
 */

import { z } from "zod";

/** Trimmed optional text: empty string is normalised to null, not "". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const createProspectSchema = z.object({
  // The only genuinely required field — everything else can be filled in later.
  name: z.string().trim().min(1, "Name is required").max(200),

  email: z
    .string()
    .trim()
    .max(320)
    .email("Enter a valid email address")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),

  phone: optionalText(50),
  title: optionalText(200),
  company: optionalText(200),
  shortSummary: optionalText(2000),

  linkedinUrl: z
    .string()
    .trim()
    .url("Enter a valid URL")
    .max(2000)
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),

  /** Reference to an existing ICP; never a copy of its fields. */
  icpId: z.string().min(1).optional().nullable(),

  /**
   * Originating Upwork job, set by the "Convert to Prospect" flow. A reference
   * only — the job keeps all of its own data. The API verifies the job belongs
   * to the caller's org before trusting this.
   */
  upworkJobId: z.string().min(1).optional().nullable(),
});

export type CreateProspectInput = z.infer<typeof createProspectSchema>;

/**
 * Edit form contract (PATCH /api/settings/prospects/[id]).
 *
 * Same human-fillable field set as create, minus the two fields that describe
 * where the prospect came from: `upworkJobId` is an immutable origin reference
 * (re-pointing it would break the 1:1 job↔prospect guarantee), and identity
 * columns like `savedById` are never user-editable. `icpId` IS editable — the
 * ICP was picked in the extension where the user had little context, so
 * correcting it later is the main reason this endpoint exists.
 *
 * Every field is optional: the client sends only what changed, and an omitted
 * key means "leave as-is" while an explicit null clears the column.
 */
export const updateProspectSchema = createProspectSchema
  .omit({ upworkJobId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export type UpdateProspectInput = z.infer<typeof updateProspectSchema>;
