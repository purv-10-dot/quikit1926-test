import { z } from "zod";

export const userRoleEnum = z.enum(["Administrator", "SalesManager", "SalesUser", "MarketingUser", "FinanceUser"]);
export const userStatusEnum = z.enum(["Active", "Inactive"]);

export const createUserSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().toLowerCase().trim(),
  phone: z.string().optional().nullable(),
  role: userRoleEnum.default("SalesUser"),
  status: userStatusEnum.default("Active"),
  /** Optional for brand-new native users — when omitted the server generates a
   *  unique temp password via generateTempPassword() and emails it to the user. */
  password: z.string().min(8).max(128).optional(),
  permissionTemplateIds: z.array(z.string().trim().min(1)).default([]),
  allowedAccountIds: z.array(z.string().trim().min(1)).default([]),
  reportingManagerId: z.string().trim().min(1).optional().nullable(),
  /** Link an existing org member into QuikCRM — skips auth.User create. */
  linkExistingUserId: z.string().trim().min(1).optional(),
  invitationMethod: z.enum(["native", "sso"]).default("native"),
});

export const updateUserSchema = createUserSchema.partial().extend({
  // Password updates go through /reset-password — strip from PATCH
  password: z.undefined().optional(),
});

export const listUsersQuerySchema = z.object({
  q: z.string().optional(),
  status: userStatusEnum.optional(),
  role: userRoleEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
