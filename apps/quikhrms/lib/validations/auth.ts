import { z } from "zod";

/** Strong password policy: 5-25 chars, at least one uppercase, lowercase,
 *  number and special character. Reused wherever a new password is set. */
export const passwordSchema = z
  .string()
  .min(5, "Password must be between 5 and 25 characters")
  .max(25, "Password must be between 5 and 25 characters")
  .regex(/[A-Z]/, "Must include at least one uppercase letter")
  .regex(/[a-z]/, "Must include at least one lowercase letter")
  .regex(/[0-9]/, "Must include at least one number")
  .regex(/[^A-Za-z0-9]/, "Must include at least one special character");

/** Live checklist rules — kept in lockstep with `passwordSchema` so the UI
 *  and the server enforce exactly the same policy. */
export const passwordRequirements: { label: string; test: (v: string) => boolean }[] = [
  { label: "Between 5 and 25 characters", test: (v) => v.length >= 5 && v.length <= 25 },
  { label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { label: "One lowercase letter", test: (v) => /[a-z]/.test(v) },
  { label: "One number", test: (v) => /[0-9]/.test(v) },
  { label: "One special character", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

/** True when every requirement passes. */
export const isPasswordValid = (v: string) => passwordRequirements.every((r) => r.test(v));

export const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password required"),
  newPassword: passwordSchema,
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
