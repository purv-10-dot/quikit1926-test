import { z } from "zod";

export type ChartType = "face" | "pace";

export const FACE_DEFAULT_FUNCTIONS = [
  "Marketing", "Sales", "Finance", "Operations",
  "Human Resources", "Technology", "Customer Success", "Legal",
];

export const PACE_DEFAULT_PROCESSES = [
  "Lead Generation", "Sales Process", "Service Delivery",
  "Invoicing & Collections", "HR & Development",
  "Customer Support", "Product Development", "Finance & Reporting",
];

export const createAccountabilityFunctionSchema = z.object({
  chartType:        z.enum(["face", "pace"]),
  name:             z.string().min(1).max(120),
  description:      z.string().max(500).optional().nullable(),
  /// Scaling Up — leading-indicator KPIs the accountable person tracks
  /// (e.g. "Sales Pipeline Value, Conversion %"). Plain text, one per line.
  leadingIndicators: z.string().max(2000).optional().nullable(),
  /// Scaling Up — key outcomes (P/L or B/S line items) the accountable
  /// person owns. Plain text, one outcome per line.
  expectedOutcomes: z.string().max(2000).optional().nullable(),
  assignedToUserId: z.string().optional().nullable(),
  teamId:           z.string().optional().nullable(),
  parentFunctionId: z.string().optional().nullable(),
  sortOrder:        z.number().int().min(0).optional(),
});

export const updateAccountabilityFunctionSchema = createAccountabilityFunctionSchema.partial();

export type CreateAccountabilityFunctionInput = z.infer<typeof createAccountabilityFunctionSchema>;
export type UpdateAccountabilityFunctionInput = z.infer<typeof updateAccountabilityFunctionSchema>;

// ─── Insights returned by GET /api/face and /api/pace ─────────────────────────
export interface AccountabilityInsights {
  totalFunctions:    number;
  accountableCount:  number;   // functions with an assignedToUserId
  emptySeatsCount:   number;   // functions without
  overloadedOwners:  Array<{ userId: string; firstName: string; lastName: string; seatCount: number; functionIds: string[] }>;
}
