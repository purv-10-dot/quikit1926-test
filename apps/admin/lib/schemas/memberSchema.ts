import { z } from "zod";

const roleEnum = z.enum([
  "super_admin",
  "admin",
  "executive",
  "manager",
  "employee",
  "coach",
]);

export const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: roleEnum,
});

export const updateMemberSchema = z.object({
  role: roleEnum.optional(),
  status: z.enum(["active", "inactive", "pending"]).optional(),
  teamIds: z.array(z.string()).optional(),
  customPermissions: z.record(z.boolean()).optional(),
});
