import { z } from "zod";

export const createTeamSchema = z.object({
  name: z.string().min(1).max(80),
  managerId: z.string().trim().min(1).optional().nullable(),
});

export const updateTeamSchema = createTeamSchema.partial();

/** Add / remove team members (non-manager users) */
export const teamMembersSchema = z.object({
  userIds: z.array(z.string().trim().min(1)).min(1),
});

export const removeMemberSchema = z.object({
  userId: z.string().trim().min(1),
});

/** Add / remove additional managers of a team */
export const teamManagersSchema = z.object({
  userIds: z.array(z.string().trim().min(1)).min(1),
});

export const removeManagerSchema = z.object({
  userId: z.string().trim().min(1),
});

/** Link / unlink a CrmSalesGroup to/from a team */
export const teamGroupSchema = z.object({
  groupId: z.string().trim().min(1),
});
