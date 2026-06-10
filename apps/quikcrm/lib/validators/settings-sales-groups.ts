import { z } from "zod";

export const createSalesGroupSchema = z.object({
  name: z.string().min(1).max(80),
});

export const updateSalesGroupSchema = createSalesGroupSchema.partial();

export const groupMembersSchema = z.object({
  userIds: z.array(z.string().trim().min(1)).min(1),
  asManager: z.boolean().default(false),
});

export const groupAccountsSchema = z.object({
  accountIds: z.array(z.string().trim().min(1)).min(1),
});
