/**
 * Zod schema for the founder Application Wizard.
 *
 * One schema per step + a `fullSchema` for the final POST. Reused on the
 * client (form validation + step gates) and on the server (POST endpoint).
 */
import { z } from "zod";

export const step1Schema = z.object({
  startupName: z.string().min(2).max(120),
  contactName: z.string().min(2).max(120),
  contactEmail: z.string().email(),
  contactPhone: z.string().max(40).optional().or(z.literal("")),
  website: z.string().url().or(z.literal("")).optional(),
  /// VCVertical.slug
  verticalSlug: z.string().min(1),
  foundedYear: z.coerce.number().int().min(1990).max(new Date().getFullYear() + 1).optional(),
  teamSize: z.coerce.number().int().min(1).max(100000).optional(),
  description: z.string().min(20, "At least 20 characters").max(2000),
});

export const step2Schema = z.object({
  fundingAskLakhs: z.coerce.number().int().positive().max(100000), // amount in INR lakhs
  loanType: z.enum(["term-loan", "rbf", "equity"]),
  tenureMonths: z.coerce.number().int().min(0).max(120).optional(),
  purpose: z.string().min(10).max(500),
});

export const step3Schema = z.object({
  monthlyRevenueLakhs: z.coerce.number().min(0).optional(),
  ebitdaLakhs: z.coerce.number().optional(),
  existingDebtLakhs: z.coerce.number().min(0).optional(),
  gstNumber: z.string().max(20).optional().or(z.literal("")),
  bankAccountLast4: z.string().max(8).optional().or(z.literal("")),
});

// Step 4 = file uploads (handled separately via Vercel Blob in /documents
// after submission completes; the wizard step is informational only).

export const fullApplicationSchema = step1Schema
  .merge(step2Schema)
  .merge(step3Schema);

export type ApplicationPayload = z.infer<typeof fullApplicationSchema>;
