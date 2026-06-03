import { z } from "zod";
import { filterPayloadSchema } from "@/lib/validators/lead-filter";
import { pageSchema, pageSizeSchema } from "@/lib/validators/pagination";

const NAME_REGEX = /^[\p{L}\s.\-'’]{1,60}$/u;

const nameField = z
  .string()
  .trim()
  .min(1, "Required")
  .max(60, "Maximum 60 characters")
  .regex(NAME_REGEX, "Letters, spaces, dots, hyphens and apostrophes only");

const optionalString = z.string().trim().max(200).optional().nullable();

export const createContactSchema = z.object({
  firstName: nameField,
  lastName: nameField,
  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(200)
    .optional()
    .nullable(),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+\d()\-\s]{0,40}$/, "Phone may contain digits, +, (, ), -, spaces only")
    .optional()
    .nullable(),
  title: optionalString,
  accountId: z.string().trim().min(1).optional().nullable(),
  leadId: z.string().trim().min(1).optional().nullable(),
  ownerId: z.string().trim().min(1).optional().nullable(),
  city: optionalString,
  contactStage: optionalString,
  source: optionalString,
});

export const updateContactSchema = createContactSchema.partial();

export const listContactsQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
  q: z.string().trim().optional(),
  accountId: z.string().trim().min(1).optional(),
  ownerId: z.string().trim().min(1).optional(),
  sortBy: z.string().default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  trashed: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "true"),
});

export const contactFilterRequestSchema = z.object({
  filter: filterPayloadSchema,
  page: pageSchema,
  pageSize: pageSizeSchema,
  sortBy: z.string().default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  /** Merged with advanced conditions (same fields as GET ?q=). */
  search: z.string().trim().optional(),
  /** When true, only soft-deleted contacts (trash view). */
  onlyDeleted: z.boolean().optional(),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;
export type ContactFilterRequest = z.infer<typeof contactFilterRequestSchema>;

export const SORTABLE_CONTACT_KEYS = new Set([
  "createdAt",
  "updatedAt",
  "firstName",
  "lastName",
  "email",
  "phone",
  "title",
  "ownerName",
]);
