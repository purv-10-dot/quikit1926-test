/**
 * Zod schemas for the platform support-ticket API, shared by every app.
 *
 * Client-safe: this module deliberately imports NOTHING from @quikit/database,
 * so a form component can `import { createSupportTicketSchema }` without
 * dragging Prisma into the browser bundle. The DB-touching handlers live in
 * `@quikit/shared/supportTickets`.
 *
 * Previously these lived in `apps/quikscale/lib/schemas/supportSchema.ts`.
 * Hoisted here when Contact Support was rolled out to every app — one shape for
 * the payload means the super-admin triage queue can trust every row it renders,
 * whichever app raised it.
 */

import { z } from "zod";
import {
  SUPPORT_ATTACHMENT_MAX_COUNT,
  SUPPORT_DESCRIPTION_MAX,
  SUPPORT_REQUEST_TYPES,
  SUPPORT_TICKET_STATUSES,
} from "./constants";

/** One attachment descriptor, as returned by POST /api/support/uploads.
 *
 *  Every field here is re-verified server-side against the stored object before
 *  a row is written (`verifySupportAttachments`) — this schema only checks the
 *  payload is well-formed, never that it is truthful. */
export const supportAttachmentSchema = z.object({
  objectKey: z.string().trim().min(1).max(512),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(128),
  sizeBytes: z.number().int().positive(),
});

/**
 * Payload for POST /api/support/tickets.
 *
 * `orgId`, `userId`, `appId`, `appSlug` and `roleName` are all derived
 * server-side from the session — they are deliberately absent here so a
 * client cannot file a ticket as another org, user or app.
 *
 * `subject` is absent too, and for a related reason: the form no longer asks
 * for one (it asks for a screenshot instead), so the server derives it from the
 * description. A client-supplied subject is ignored rather than trusted.
 */
export const createSupportTicketSchema = z.object({
  description: z
    .string()
    .trim()
    .min(10, "Please describe the issue in at least 10 characters")
    .max(
      SUPPORT_DESCRIPTION_MAX,
      `Description must be ${SUPPORT_DESCRIPTION_MAX} characters or fewer`,
    ),
  requestType: z.enum(SUPPORT_REQUEST_TYPES, {
    errorMap: () => ({ message: "Select a valid request type" }),
  }),
  attachments: z
    .array(supportAttachmentSchema)
    .max(
      SUPPORT_ATTACHMENT_MAX_COUNT,
      `Attach at most ${SUPPORT_ATTACHMENT_MAX_COUNT} files`,
    )
    .optional()
    .default([]),
});

export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;

/** Optional filters on the user's own ticket list. */
export const listSupportTicketsSchema = z.object({
  status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
  requestType: z.enum(SUPPORT_REQUEST_TYPES).optional(),
  /** Narrow to tickets raised from one app. Omitted → every app. */
  appSlug: z.string().trim().min(1).max(64).optional(),
});

export type ListSupportTicketsInput = z.infer<typeof listSupportTicketsSchema>;
