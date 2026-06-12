import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => {
      const t = v?.trim();
      return t === "" || t === undefined ? null : t;
    });

const optionalUrl = z
  .string()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => {
    const t = v?.trim();
    return t === "" || t === undefined ? null : t;
  })
  .refine((v) => v === null || /^https?:\/\/.+/i.test(v), {
    message: "Enter a valid URL starting with http:// or https://",
  });

export const companyProfilePatchSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  industry: optionalText(120),
  website: optionalUrl,
  phone: optionalText(50),
  employees: optionalText(50),
  logoUrl: optionalUrl,
});

export type CompanyProfilePatchInput = z.infer<typeof companyProfilePatchSchema>;
