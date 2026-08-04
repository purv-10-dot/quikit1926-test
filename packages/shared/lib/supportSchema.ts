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
  SUPPORT_DESCRIPTION_MAX,
  SUPPORT_REQUEST_TYPES,
  SUPPORT_SUBJECT_MAX,
  SUPPORT_TICKET_STATUSES,
} from "./constants";

/**
 * Payload for POST /api/support/tickets.
 *
 * `orgId`, `userId`, `appId`, `appSlug` and `roleName` are all derived
 * server-side from the session — they are deliberately absent here so a
 * client cannot file a ticket as another org, user or app.
 */
export const createSupportTicketSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(3, "Subject must be at least 3 characters")
    .max(SUPPORT_SUBJECT_MAX, `Subject must be ${SUPPORT_SUBJECT_MAX} characters or fewer`),
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
