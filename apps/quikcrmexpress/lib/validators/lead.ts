import { z } from "zod";
import { LEAD_TYPE_OPTIONS } from "@/lib/leads/lead-type-config";
import { DEFAULT_LEAD_SOURCES } from "@/lib/leads/lead-sources-defaults";
import { LEAD_CREATION_CHANNELS } from "@/lib/services/leads/log-lead-system-activities";
import { pageSchema, pageSizeSchema, ALLOWED_PAGE_SIZES, DEFAULT_PAGE_SIZE } from "./pagination";

// Re-export so existing importers (`@/lib/validators/lead`) keep working — these
// constants moved to ./pagination so every module can share one allow-list.
export { ALLOWED_PAGE_SIZES, DEFAULT_PAGE_SIZE };

/**
 * Stage and status are now free-text strings. Allowed values come from the org's
 * leadPipelineConfig at request time — see getPipelineConfig() and the dependent
 * rules check in src/app/api/leads/route.ts. The handlers reject anything that
 * isn't in the configured stages/statuses.
 */
export const leadStageString = z.string().trim().min(1).max(80);
export const leadStatusString = z.string().trim().min(1).max(80);

/**
 * Phone/mobile accept messy input (digits, +, (), -, spaces). The server
 * normalizes to E.164 and rejects genuinely-invalid numbers after Zod parse —
 * see lib/services/shared/phone-normalize.ts + the lead POST/PATCH routes.
 * (Was a strict e164Regex here, which 400'd bare digits users type.)
 */
const leadPhoneSchema = z
  .string()
  .trim()
  .max(40)
  .regex(/^[+\d()\-\s]{0,40}$/, "Phone may contain digits, +, (, ), -, spaces only")
  .optional()
  .nullable();

const optionalUrlSchema = z
  .string()
  .trim()
  .max(300)
  .refine(
    (v) =>
      !v ||
      /^(https?:\/\/)?[\w.-]+\.[\w.-]+|^https?:\/\/(localhost|[\w-]+)(:\d+)?(\/.*)?$/i.test(v),
    { message: "Must be a valid URL" },
  )
  .optional()
  .nullable();

/** Defaults applied when create payload omits source/stage/status. */
export const LEAD_CREATE_DEFAULTS = {
  source: DEFAULT_LEAD_SOURCES[0],
  stage: "New" as const,
  status: "Open" as const,
};

const createLeadObjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  // B2C / SME motion: company, firstName, lastName are optional. CrmExpress agents
  // create individual leads that have no company and no split name. The DB only
  // requires `name` + `tenantId`; the route strips firstName/lastName before insert.
  // Identity floor ("≥1 of email/mobile") is enforced in createLeadSchema.superRefine.
  email: z.string().trim().email("Invalid email").optional().nullable(),
  phone: leadPhoneSchema,
  mobile: leadPhoneSchema,
  company: z.string().trim().min(1).max(200).optional().nullable(),
  firstName: z.string().trim().min(1).max(120).optional().nullable(),
  lastName: z.string().trim().min(1).max(120).optional().nullable(),
  jobTitle: z.string().trim().optional().nullable(),
  leadType: z.enum(LEAD_TYPE_OPTIONS).optional().nullable(),
  source: z.string().trim().min(1),
  stage: leadStageString.default(LEAD_CREATE_DEFAULTS.stage),
  status: leadStatusString.default(LEAD_CREATE_DEFAULTS.status),
  substatus: z.string().trim().max(120).optional().nullable(),
  score: z.number().int().min(0).max(100).optional(),
  // Accept both UUID (legacy) and CUID (monorepo). Just require non-empty.
  ownerId: z.string().trim().min(1).optional().nullable(),
  ownerName: z.string().trim().optional().nullable(),
  accountId: z.string().trim().min(1).optional().nullable(),
  country: z.string().trim().optional().nullable(),
  industry: z.string().trim().max(120).optional().nullable(),
  secondaryEmail: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((v) => !v || z.string().email().safeParse(v).success, {
      message: "Invalid secondary email",
    }),
  website: optionalUrlSchema,
  linkedinUrl: optionalUrlSchema,
  annualRevenueDisplay: z.string().trim().max(120).optional().nullable(),
  descriptionInformation: z.string().trim().max(1000).optional().nullable(),
  topic: z.string().trim().max(200).optional().nullable(),
  technology: z.array(z.string().trim().min(1).max(80)).optional().nullable(),
  requirementDetails: z.record(z.unknown()).optional().nullable(),
  sourceDetails: z.string().trim().max(500).optional().nullable(),
  contactLinkedinUrl: optionalUrlSchema,
  leadQuality: z.string().optional().nullable(),
  externalId: z.string().optional().nullable(),
  sourceSystem: z.string().optional().nullable(),
  originChannel: z.enum(LEAD_CREATION_CHANNELS).optional().nullable(),
  isStarred: z.boolean().optional(),
  addressLine1: z.string().trim().max(300).optional().nullable(),
  addressLine2: z.string().trim().max(300).optional().nullable(),
  cityName: z.string().trim().max(120).optional().nullable(),
  stateName: z.string().trim().max(120).optional().nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  lat: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isNaN(n) ? Number.NaN : n;
    })
    .refine((v) => v === null || (v >= -90 && v <= 90), {
      message: "Latitude must be between -90 and 90",
    }),
  long: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isNaN(n) ? Number.NaN : n;
    })
    .refine((v) => v === null || (v >= -180 && v <= 180), {
      message: "Longitude must be between -180 and 180",
    }),
  dynamicFields: z.record(z.unknown()).optional(),
});

/**
 * Owner is required (ownerId or ownerName) and at least one identity
 * (email or mobile) must be present — company/firstName/lastName are optional
 * to support the B2C / individual-lead motion.
 */
export const createLeadSchema = createLeadObjectSchema.superRefine((val, ctx) => {
  if (!val.ownerId && !val.ownerName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ownerId"],
      message: "Owner is required (ownerId or ownerName).",
    });
  }
  if (!val.email && !val.mobile) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mobile"],
      message: "At least one of email or mobile is required.",
    });
  }
});

const updateLeadObjectSchema = createLeadObjectSchema
  .omit({ leadType: true, firstName: true, lastName: true, company: true })
  .extend({
    // leadType is nullable on update: the edit form sends `leadType || null`, so
    // a lead with no type set PATCHes `null`. Create schema is .optional().nullable();
    // update must match or every save on an untyped lead 400s. The route strips
    // leadType before the Prisma write, so accepting null is harmless.
    leadType: z.enum(LEAD_TYPE_OPTIONS).optional().nullable(),
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().min(1).max(120).optional(),
    company: z.string().trim().min(1).optional(),
  })
  .partial();

/** Patch path stays lenient — partial updates don't re-enforce required fields. */
export const updateLeadSchema = updateLeadObjectSchema;

export const transitionLeadSchema = z.object({
  stage: leadStageString.optional(),
  status: leadStatusString.optional(),
  substatus: z.string().optional().nullable(),
  dispositionData: z.record(z.unknown()).optional(),
});

export const convertLeadSchema = z
  .object({
    createContact: z.boolean().default(true),
    createOpportunity: z.boolean().default(false),
    opportunityTitle: z.string().optional(),
    opportunityAmount: z.number().optional(),
    opportunityCloseDate: z.string().datetime().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.createOpportunity && !val.createContact) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["createContact"],
        message: "createContact must be true when createOpportunity is true",
      });
    }
    if (val.opportunityCloseDate) {
      const d = new Date(val.opportunityCloseDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d.getTime() < today.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["opportunityCloseDate"],
          message: "opportunityCloseDate must be today or in the future",
        });
      }
    }
  });

export const listLeadsQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  q: z.string().optional(),
  stage: leadStageString.optional(),
  status: leadStatusString.optional(),
  ownerId: z.string().optional(),
  isStarred: z.coerce.boolean().optional(),
  sortBy: z.string().default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type TransitionLeadInput = z.infer<typeof transitionLeadSchema>;
