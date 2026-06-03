/**
 * Approval Workflow repository — Postgres-backed via Prisma.
 *
 * Replaces the in-memory store in `./store.ts`. Routes should call these
 * helpers so workflows + their steps persist across restarts.
 *
 * Storage:
 *   - cn_approval_workflows      (header: name, entityType, isActive)
 *   - cn_approval_workflow_steps (lines: stepOrder, role, thresholds)
 */

import { db } from "@/lib/db/prisma";

export interface WorkflowStepInput {
  stepOrder: number;
  approverRole?: string | null;       // stored in approverRoleId for now
  approverUserId?: string | null;
  /**
   * Pool of users eligible to act on this step. Empty / undefined keeps
   * legacy single-user behavior. The resolver picks the first eligible
   * member (requester excluded); the UI surfaces this as a multi-select.
   */
  approverUserIds?: string[] | null;
  approverDepartmentId?: string | null;
  amountThresholdMin?: number | string | null;
  amountThresholdMax?: number | string | null;
  isConditional?: boolean;
  conditionField?: string | null;
  conditionOperator?: string | null;
  conditionValue?: string | null;
}

export interface CreateWorkflowInput {
  orgId: string;
  // Null/undefined creates the org-wide Default; a value scopes the
  // workflow to that single project. See schema comment on CnApprovalWorkflow.
  projectId?: string | null;
  name: string;
  entityType: string;
  isActive?: boolean;
  steps?: WorkflowStepInput[];
  createdBy: string;
}

export interface ListWorkflowsOptions {
  orgId: string;
  entityType?: string;
  // Three-state filter:
  //   undefined          → return every row across all projects (admin grid)
  //   null / "default"   → return only Default (projectId IS NULL) rows
  //   <projectId>        → return only overrides for that project
  projectId?: string | null;
}

// Shape returned to the frontend. Matches what the existing in-memory
// store produced so the UI doesn't need to change.
function enrichWorkflow(row: any): any {
  const steps = (row.steps ?? []).map((s: any) => ({
    id: s.id,
    stepOrder: s.stepOrder,
    approverRole: s.approverRoleId ?? null,
    approverUserId: s.approverUserId ?? null,
    approverUserIds: Array.isArray(s.approverUserIds) ? s.approverUserIds : [],
    approverDepartmentId: s.approverDepartmentId ?? null,
    amountThresholdMin: s.amountThresholdMin?.toString?.() ?? null,
    amountThresholdMax: s.amountThresholdMax?.toString?.() ?? null,
    isConditional: !!s.isConditional,
  }));
  return {
    id: row.id,
    orgId: row.orgId,
    projectId: row.projectId ?? null,
    name: row.name,
    entityType: row.entityType,
    isActive: !!row.isActive,
    steps,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

// ─── Queries ────────────────────────────────────────────────────────

export async function listWorkflows(opts: ListWorkflowsOptions): Promise<any[]> {
  const where: Record<string, unknown> = { orgId: opts.orgId };
  if (opts.entityType) where.entityType = opts.entityType;
  // `projectId === undefined` → no filter, return both Default and every override.
  // `projectId === null` (or sentinel "default") → only Default rows.
  // Any string value → only that project's overrides.
  if (opts.projectId === null || opts.projectId === "default") {
    where.projectId = null;
  } else if (typeof opts.projectId === "string") {
    where.projectId = opts.projectId;
  }

  const rows = await (db as any).cnApprovalWorkflow.findMany({
    where,
    include: { steps: { orderBy: { stepOrder: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(enrichWorkflow);
}

export async function findWorkflowById(
  orgId: string,
  id: string,
): Promise<any | null> {
  const row = await (db as any).cnApprovalWorkflow.findFirst({
    where: { id, orgId },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
  });
  return row ? enrichWorkflow(row) : null;
}

// ─── Mutations ──────────────────────────────────────────────────────

export async function createWorkflow(input: CreateWorkflowInput): Promise<any> {
  const row = await (db as any).cnApprovalWorkflow.create({
    data: {
      orgId: input.orgId,
      projectId: input.projectId ?? null,
      name: input.name,
      entityType: input.entityType,
      isActive: input.isActive ?? true,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
      steps: {
        create: (input.steps ?? []).map((s) => ({
          stepOrder: Number(s.stepOrder) || 1,
          approverRoleId: s.approverRole ?? null,
          approverUserId: s.approverUserId ?? null,
          approverUserIds: Array.isArray(s.approverUserIds)
            ? s.approverUserIds.filter((x) => typeof x === "string" && x.length > 0)
            : [],
          approverDepartmentId: s.approverDepartmentId ?? null,
          amountThresholdMin:
            s.amountThresholdMin !== undefined && s.amountThresholdMin !== null && s.amountThresholdMin !== ""
              ? String(s.amountThresholdMin)
              : null,
          amountThresholdMax:
            s.amountThresholdMax !== undefined && s.amountThresholdMax !== null && s.amountThresholdMax !== ""
              ? String(s.amountThresholdMax)
              : null,
          isConditional: s.isConditional ?? false,
          conditionField: s.conditionField ?? null,
          conditionOperator: s.conditionOperator ?? null,
          conditionValue: s.conditionValue ?? null,
        })),
      },
    },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
  });
  return enrichWorkflow(row);
}

export interface UpdateWorkflowInput {
  name?: string;
  entityType?: string;
  isActive?: boolean;
  // `null` re-scopes to Default; a string moves the row to that project.
  // Most callers leave this undefined — the project assignment is fixed
  // at create time and rarely flips.
  projectId?: string | null;
  steps?: WorkflowStepInput[];
  updatedBy: string;
}

/**
 * Update a workflow. If `steps` is provided, the old steps are wiped and
 * replaced wholesale — simpler than trying to reconcile individual step
 * edits. If `steps` is `undefined`, existing steps are preserved.
 */
export async function updateWorkflow(
  orgId: string,
  id: string,
  patch: UpdateWorkflowInput,
): Promise<any | null> {
  // Verify the row exists (and is org-scoped) before we touch steps.
  const existing = await (db as any).cnApprovalWorkflow.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const headerData: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.name !== undefined) headerData.name = patch.name;
  if (patch.entityType !== undefined) headerData.entityType = patch.entityType;
  if (patch.isActive !== undefined) headerData.isActive = patch.isActive;
  if (patch.projectId !== undefined) headerData.projectId = patch.projectId;

  // Replace-all steps strategy. Wrapped in a transaction so partial
  // failures don't leave the workflow in a half-edited state.
  await (db as any).$transaction(async (tx: any) => {
    await tx.cnApprovalWorkflow.update({
      where: { id },
      data: headerData,
    });
    if (patch.steps !== undefined) {
      await tx.cnApprovalWorkflowStep.deleteMany({ where: { workflowId: id } });
      if (patch.steps.length > 0) {
        await tx.cnApprovalWorkflowStep.createMany({
          data: patch.steps.map((s) => ({
            workflowId: id,
            stepOrder: Number(s.stepOrder) || 1,
            approverRoleId: s.approverRole ?? null,
            approverUserId: s.approverUserId ?? null,
            approverUserIds: Array.isArray(s.approverUserIds)
              ? s.approverUserIds.filter((x) => typeof x === "string" && x.length > 0)
              : [],
            approverDepartmentId: s.approverDepartmentId ?? null,
            amountThresholdMin:
              s.amountThresholdMin !== undefined && s.amountThresholdMin !== null && s.amountThresholdMin !== ""
                ? String(s.amountThresholdMin)
                : null,
            amountThresholdMax:
              s.amountThresholdMax !== undefined && s.amountThresholdMax !== null && s.amountThresholdMax !== ""
                ? String(s.amountThresholdMax)
                : null,
            isConditional: s.isConditional ?? false,
            conditionField: s.conditionField ?? null,
            conditionOperator: s.conditionOperator ?? null,
            conditionValue: s.conditionValue ?? null,
          })),
        });
      }
    }
  });

  return findWorkflowById(orgId, id);
}

export type DeleteWorkflowResult =
  | { status: "not_found" }
  | { status: "deleted" }
  | { status: "in_use"; instanceCount: number };

/**
 * Approval instances reference the workflow via a non-cascading FK so
 * history survives. We refuse hard-delete when any instance exists and
 * return `in_use` — the caller maps that to a 409 with a clear message.
 * Edits should go through `updateWorkflow` (replace-all steps), which
 * keeps the workflowId stable.
 */
export async function deleteWorkflow(
  orgId: string,
  id: string,
): Promise<DeleteWorkflowResult> {
  const existing = await (db as any).cnApprovalWorkflow.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return { status: "not_found" };

  const instanceCount = await (db as any).cnApprovalInstance.count({
    where: { workflowId: id, orgId },
  });
  if (instanceCount > 0) {
    return { status: "in_use", instanceCount };
  }

  await (db as any).cnApprovalWorkflow.delete({ where: { id } });
  return { status: "deleted" };
}
