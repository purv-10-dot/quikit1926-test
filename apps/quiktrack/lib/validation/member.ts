import { z } from "zod";

export const projectRoleEnum = z.enum(["PROJECT_ADMIN", "MEMBER", "VIEWER"]);

export const addMemberSchema = z
  .object({
    userId: z.string().min(1).optional(),
    email: z.string().email().optional(),
    role: projectRoleEnum.default("MEMBER"),
    message: z.string().max(2000).optional(),
  })
  .refine((d) => Boolean(d.userId || d.email), {
    message: "Provide userId or email",
  });

export const updateMemberSchema = z.object({
  role: projectRoleEnum,
});
