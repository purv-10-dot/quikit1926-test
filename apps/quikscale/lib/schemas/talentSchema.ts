import { z } from "zod";

export const talentAssessmentSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  potential: z.enum(["low", "medium", "high"]).default("medium"),
  flightRisk: z.enum(["low", "medium", "high"]).default("low"),
  successionReady: z.enum(["ready", "developing", "not-ready"]).default("not-ready"),
  skills: z.array(z.string()).default([]),
  developmentNotes: z.string().nullable().optional(),
  quarter: z.string().regex(/^Q[1-4]$/, "Quarter must be Q1-Q4").default("Q1"),
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()),
});
