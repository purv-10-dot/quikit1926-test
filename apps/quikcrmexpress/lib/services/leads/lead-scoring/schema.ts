import { z } from "zod";
import { LEAD_SCORING_OPERATORS } from "@/lib/services/leads/lead-scoring/types";

const ruleSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  enabled: z.boolean(),
  field: z.string().min(1).max(120),
  operator: z.enum(LEAD_SCORING_OPERATORS),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.null(),
  ]),
  points: z.number().int().min(-100).max(100),
});

export const configSchema = z.object({
  enabled: z.boolean().default(true),
  autoRecalculate: z.boolean().default(true),
  allowManualOverride: z.boolean().default(false),
  rules: z.array(ruleSchema).default([]),
  behavior: z
    .object({
      enabled: z.boolean().default(true),
      maxBaselinePoints: z.number().int().min(0).max(100).default(55),
    })
    .default({ enabled: true, maxBaselinePoints: 55 }),
});
