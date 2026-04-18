import { z } from "zod";

// Shared field set for create/update (kept in one place to avoid drift)
const kpiBaseFields = {
  name: z.string().min(1, "KPI name is required").max(200),
  description: z.string().max(1000).optional().nullable(),
  kpiLevel: z.enum(["individual", "team"]).default("individual"),
  owner: z.string().cuid("Invalid owner ID").optional().nullable(),
  // Team KPI multi-owner fields
  ownerIds: z.array(z.string().cuid()).optional(),
  ownerContributions: z.record(z.string(), z.number().min(0).max(100)).optional().nullable(),
  teamId: z.string().cuid("Invalid team ID").optional().nullable(),
  parentKPIId: z.string().cuid("Invalid parent KPI ID").optional().nullable(),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
  year: z.number().int().min(2020).max(2099),
  measurementUnit: z.enum(["Number", "Percentage", "Currency", "Ratio"]),
  target: z.number().positive().optional().nullable(),
  quarterlyGoal: z.number().positive().optional().nullable(),
  qtdGoal: z.number().positive().optional().nullable(),
  status: z.enum(["active", "paused", "completed"]).default("active"),
  divisionType: z.enum(["Cumulative", "Standalone"]).default("Cumulative"),
  weeklyTargets: z.record(z.string(), z.number()).optional().nullable(),
  // Team KPI per-owner weekly targets: { userId: { weekNumber: value } }
  weeklyOwnerTargets: z.record(z.string(), z.record(z.string(), z.number())).optional().nullable(),
  currency: z.string().optional().nullable(),
  targetScale: z.string().optional().nullable(),
  reverseColor: z.boolean().optional(),
};

// Create KPI — enforces the kpiLevel invariants:
//   individual → owner required, ownerIds must be empty
//   team       → teamId required AND owner must be null AND ownerIds non-empty AND
//                ownerContributions keys == ownerIds AND contributions sum to 100
export const createKPISchema = z
  .object(kpiBaseFields)
  .refine(
    (d) => {
      if (d.kpiLevel === "individual") return !!d.owner && (!d.ownerIds || d.ownerIds.length === 0);
      if (d.kpiLevel === "team") return !!d.teamId && !d.owner && !!d.ownerIds && d.ownerIds.length > 0;
      return false;
    },
    {
      message:
        "Individual KPIs require an owner; team KPIs require a teamId and at least one ownerId.",
      path: ["kpiLevel"],
    }
  )
  .refine(
    (d) => {
      if (d.kpiLevel !== "team" || !d.ownerIds || !d.ownerContributions) return true;
      // Keys of ownerContributions must match ownerIds (both ways)
      const idsSet = new Set(d.ownerIds);
      const keysSet = new Set(Object.keys(d.ownerContributions));
      if (idsSet.size !== keysSet.size) return false;
      for (const id of idsSet) if (!keysSet.has(id)) return false;
      // Contributions must sum to 100 (allow ±0.5 rounding slack)
      const sum = Object.values(d.ownerContributions).reduce((s, v) => s + v, 0);
      return Math.abs(sum - 100) <= 0.5;
    },
    {
      message:
        "Owner contributions must be provided for every owner and sum to 100%.",
      path: ["ownerContributions"],
    }
  );

// Update KPI — all fields optional except name. We rebuild manually because
// .refine() is lost by .partial(). The soft refinement only rejects explicit
// contradictions; the full cross-row invariant is re-checked against the
// existing row in the PUT handler.
export const updateKPISchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional().nullable(),
    kpiLevel: z.enum(["individual", "team"]).optional(),
    owner: z.string().cuid().optional().nullable(),
    ownerIds: z.array(z.string().cuid()).optional(),
    ownerContributions: z.record(z.string(), z.number().min(0).max(100)).optional().nullable(),
    teamId: z.string().cuid().optional().nullable(),
    parentKPIId: z.string().cuid().optional().nullable(),
    quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]).optional(),
    year: z.number().int().min(2020).max(2099).optional(),
    measurementUnit: z.enum(["Number", "Percentage", "Currency", "Ratio"]).optional(),
    target: z.number().positive().optional().nullable(),
    quarterlyGoal: z.number().positive().optional().nullable(),
    qtdGoal: z.number().positive().optional().nullable(),
    status: z.enum(["active", "paused", "completed"]).optional(),
    divisionType: z.enum(["Cumulative", "Standalone"]).optional(),
    weeklyTargets: z.record(z.string(), z.number()).optional().nullable(),
    weeklyOwnerTargets: z.record(z.string(), z.record(z.string(), z.number())).optional().nullable(),
    currency: z.string().optional().nullable(),
    targetScale: z.string().optional().nullable(),
    reverseColor: z.boolean().optional(),
  })
  .refine(
    (d) => {
      // Reject contradictions only — partial updates that don't touch kpiLevel pass through
      if (d.kpiLevel === "team" && d.owner) return false;
      if (d.kpiLevel === "individual" && d.owner === null) return false;
      return true;
    },
    { message: "owner/teamId invariant violated for kpiLevel", path: ["kpiLevel"] }
  );

// Weekly Value Schema
// Phase 2: userId attributes the weekly value to a specific owner (team KPIs)
// or to the KPI owner (individual KPIs — may be omitted and inferred server-side).
export const weeklyValueSchema = z.object({
  weekNumber: z.number().int().min(1).max(13),
  value: z.number().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  userId: z.string().cuid().optional().nullable(),
});

// KPI Note Schema
export const kpiNoteSchema = z.object({
  content: z.string().min(1, "Note content is required").max(5000),
});

// List Query Params
export const kpiListParamsSchema = z.object({
  page: z.number().int().min(1).default(1),
  // Capped at 100 — consistent with other list endpoints and the shared
  // parsePaginationParams MAX_LIMIT. Bulk-export use cases should hit a
  // dedicated export route, not inflate pageSize.
  pageSize: z.number().int().min(1).max(100).default(20),
  status: z.enum(["active", "paused", "completed"]).optional(),
  kpiLevel: z.enum(["individual", "team"]).optional(),
  owner: z.string().cuid().optional(),
  teamId: z.string().cuid().optional(),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]).optional(),
  year: z.number().int().optional(),
  search: z.string().optional(),
  sortBy: z.enum(["name", "createdAt", "progressPercent", "healthStatus"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateKPIInput = z.infer<typeof createKPISchema>;
export type UpdateKPIInput = z.infer<typeof updateKPISchema>;
export type WeeklyValueInput = z.infer<typeof weeklyValueSchema>;
export type KPINoteInput = z.infer<typeof kpiNoteSchema>;
export type KPIListParams = z.infer<typeof kpiListParamsSchema>;
