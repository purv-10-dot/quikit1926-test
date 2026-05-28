import { z } from "zod";

// ── Estimation (mirrors BOQ shape) ───────────────────────────────

export const estItemSchema = z.object({
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
  kind: z.enum(["item", "group"]).default("item"),
  code: z.string().optional().nullable(),
  description: z.string().min(1).max(500),
  itemId: z.string().optional().nullable(),
  uomId: z.string().optional().nullable(),
  quantity: z.number().positive().optional().nullable(),
  rate: z.number().min(0).optional().nullable(),
  gstRate: z.number().min(0).max(100).optional().nullable(),
});

export const estimationCreateSchema = z.object({
  estimationNumber: z.string().min(1).max(50),
  projectId: z.string().min(1),
  estimationDate: z.string().min(1),
  currency: z.string().default("INR"),
  remarks: z.string().optional().nullable(),
  items: z.array(estItemSchema).min(1),
});
export type EstimationCreateInput = z.infer<typeof estimationCreateSchema>;

// ── Work Order ───────────────────────────────────────────────────

export const woLineSchema = z.object({
  itemId: z.string().optional().nullable(),
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  uomId: z.string().optional().nullable(),
  rate: z.number().min(0),
  gstRate: z.number().min(0).max(100).optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export const woCreateSchema = z.object({
  woNumber: z.string().min(1).max(50),
  projectId: z.string().min(1),
  contractorId: z.string().min(1),
  workCategoryId: z.string().optional().nullable(),
  woDate: z.string().min(1),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  paymentTermsDays: z.number().int().min(0).max(365).optional().nullable(),
  termsConditionId: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  lines: z.array(woLineSchema).min(1),
});
export type WoCreateInput = z.infer<typeof woCreateSchema>;

// ── RAB ──────────────────────────────────────────────────────────

/**
 * RAB line input from the client:
 *   - boqItemId chosen from the source BOQ
 *   - cumulativeQtyDone: total done through the end of this bill's period
 * Server computes prior cumulative (from previous RABs on same boqItem) and
 * currentPeriodQty = cumulative - prior.
 */
export const rabLineInputSchema = z.object({
  boqItemId: z.string().min(1),
  cumulativeQtyDone: z.number().min(0),
  gstRate: z.number().min(0).max(100).optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export const rabCreateSchema = z.object({
  rabNumber: z.string().min(1).max(50),
  projectId: z.string().min(1),
  boqId: z.string().min(1),
  rabDate: z.string().min(1),
  billedTillDate: z.string().min(1),
  remarks: z.string().optional().nullable(),
  lines: z.array(rabLineInputSchema).min(1),
});
export type RabCreateInput = z.infer<typeof rabCreateSchema>;
