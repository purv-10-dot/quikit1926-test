import { z } from "zod";

/** POST /api/org/select — switch active tenant for the current user. */
export const selectOrgSchema = z.object({
  tenantId: z.string().min(1, "tenantId is required"),
});

/** POST /api/org/invitations — accept/decline a pending invitation. */
export const invitationActionSchema = z.object({
  membershipId: z.string().min(1, "membershipId is required"),
  action: z.enum(["accept", "decline"]),
});

export type SelectOrgInput = z.infer<typeof selectOrgSchema>;
export type InvitationActionInput = z.infer<typeof invitationActionSchema>;
