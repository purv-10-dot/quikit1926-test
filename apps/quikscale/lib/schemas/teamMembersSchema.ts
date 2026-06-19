import { z } from "zod";

/**
 * POST /api/org/teams/[id]/members — add members to a team.
 *
 * Accepts a non-empty list of userIds. Each user must already have an
 * active Membership in the tenant; the route sets Membership.teamId to
 * the team (primary-team model used by the Teams page list query) and
 * upserts a UserTeam row for multi-team tracking.
 */
export const addTeamMembersSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1, "At least one user is required"),
});

export type AddTeamMembersInput = z.infer<typeof addTeamMembersSchema>;
