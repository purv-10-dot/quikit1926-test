import { z } from "zod";
import { digitsOnly } from "@/lib/utils/phone-helpers";

/** Self-service profile patch from Settings → My Profile. */
export const patchMeSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  phone: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((v) => !v || digitsOnly(v).length >= 10, {
      message: "Mobile must have at least 10 digits",
    }),
});

export type PatchMeInput = z.infer<typeof patchMeSchema>;
