import { z } from "zod";

// Shared field set for create/update (kept in one place to avoid drift)
const kpiBaseFields = {
  // No length cap on user-content fields — Prisma columns are `text` (no DB
  // limit) and product wants users to enter long descriptive names freely.
  // `.min(1)` stays so empty names are still rejected.
  name: z.string().min(1, "KPI name is required"),
  description: z.string().optional().nullable(),
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
  // Team KPI: optional per-owner override for the auto-created child Individual
  // KPI's name. Shape: { userId: "Custom name" }. Missing entries → child uses
  // the Team KPI's `name`.
  ownerKpiNames: z.record(z.string(), z.string().min(1)).optional().nullable(),
  currency: z.string().optional().nullable(),
  targetScale: z.string().optional().nullable(),
  // Per-KPI display toggle — show/accept currency values in the chosen scale unit.
  scaledDisplay: z.boolean().optional(),
  reverseColor: z.boolean().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]).default("weekly"),
  // Set true only by the OPSP "Export → Create KPIs" flow. Display-only flag;
  // the Add/Edit KPI form never sends it (defaults false).
  importedFromOpsp: z.boolean().optional(),
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
    name: z.string().min(1),
    description: z.string().optional().nullable(),
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
    // Per-owner Individual KPI name override. Only meaningful when the row is a
    // Team KPI; the PUT handler uses it to rename child Individual KPIs.
    ownerKpiNames: z.record(z.string(), z.string().min(1)).optional().nullable(),
    currency: z.string().optional().nullable(),
    targetScale: z.string().optional().nullable(),
    scaledDisplay: z.boolean().optional(),
    reverseColor: z.boolean().optional(),
    frequency: z.enum(["daily", "weekly", "monthly", "yearly"]).optional(),
    // OPSP "Export → Replace KPI" flow only. When true, wipe the existing KPI's
    // weekly actuals + notes + cached progress so the replaced KPI starts
    // fresh ("Reset"); when false/absent the previous data is carried forward.
    resetWeeklyData: z.boolean().optional(),
    // When true, email the owner that their KPI was replaced (set by the OPSP
    // export replace flow; the normal Edit form never sends it).
    notifyReplacement: z.boolean().optional(),
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
  // No length cap — DB column is TEXT. Lifted because users were hitting
  // the previous 500-char limit on pasted weekly updates.
  notes: z.string().optional().nullable(),
  userId: z.string().cuid().optional().nullable(),
});

// Batch update — one network call, many (kpiId, userId, weekNumber) upserts.
// Server runs per-input validation, permission check, past-week gate, and
// returns per-input results so the client can surface partial failures.
export const weeklyValueBatchSchema = z.object({
  inputs: z.array(weeklyValueSchema).min(1).max(13 * 50), // up to 50 owners × 13 weeks
});

// KPI Note Schema
// No max length — DB column is TEXT. `min(1)` stays so empty notes are
// still rejected (content rule, not a length cap).
export const kpiNoteSchema = z.object({
  content: z.string().min(1, "Note content is required"),
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
  // Dashboard "My Dashboard" scope: returns KPIs the current user is an owner
  // of across BOTH levels in one sortable/paginatable query — individual KPIs
  // they own (KPI.owner === me) ∪ team KPIs they co-own (KPI.ownerIds ∋ me).
  // Overrides admin row-level bypass so the dashboard stays personal. See the
  // route's `scope` branch.
  scope: z.enum(["mine"]).optional(),
  owner: z.string().cuid().optional(),
  teamId: z.string().cuid().optional(),
  parentKPIId: z.string().cuid().optional(),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]).optional(),
  year: z.number().int().optional(),
  search: z.string().optional(),
  sortBy: z
    .enum([
      "name",
      "createdAt",
      "progressPercent",
      "healthStatus",
      "owner",
      "team",
      "measurementUnit",
      "target",
      "quarterlyGoal",
      "qtdGoal",
      "qtdAchieved",
      "description",
    ])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateKPIInput = z.infer<typeof createKPISchema>;
export type UpdateKPIInput = z.infer<typeof updateKPISchema>;
export type WeeklyValueInput = z.infer<typeof weeklyValueSchema>;
export type KPINoteInput = z.infer<typeof kpiNoteSchema>;
export type KPIListParams = z.infer<typeof kpiListParamsSchema>;
