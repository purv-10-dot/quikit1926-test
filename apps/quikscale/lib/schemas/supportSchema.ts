import { z } from "zod";
import {
  SUPPORT_REQUEST_TYPES,
  SUPPORT_TICKET_STATUSES,
} from "@quikit/shared";

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
    .max(160, "Subject must be 160 characters or fewer"),
  description: z
    .string()
    .trim()
    .min(10, "Please describe the issue in at least 10 characters")
    .max(5000, "Description must be 5000 characters or fewer"),
  requestType: z.enum(SUPPORT_REQUEST_TYPES, {
    errorMap: () => ({ message: "Select a valid request type" }),
  }),
});

export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;

/** Optional filters on the user's own ticket list. */
export const listSupportTicketsSchema = z.object({
  status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
  requestType: z.enum(SUPPORT_REQUEST_TYPES).optional(),
});
