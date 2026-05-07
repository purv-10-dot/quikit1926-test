/**
 * Approval Workflow repository — Postgres-backed via Prisma.
 *
 * Replaces the in-memory store in `./store.ts`. Routes should call these
 * helpers so workflows + their steps persist across restarts.
 *
 * Storage:
 *   - approval_workflows      (header: name, entityType, isActive)
 *   - approval_workflow_steps (lines: stepOrder, role, thresholds)
 */

import { db } from "@/lib/db/prisma";

export interface WorkflowStepInput {
  stepOrder: number;
  approverRole?: string | null;       // stored in approverRoleId for now
  approverUserId?: string | null;
  approverDepartmentId?: string | null;
  amountThresholdMin?: number | string | null;
  amountThresholdMax?: number | string | null;
  isConditional?: boolean;
  conditionField?: string | null;
  conditionOperator?: string | null;
  conditionValue?: string | null;
}

export interface CreateWorkflowInput {
  tenantId: string;
  orgId: string;
  name: string;
  entityType: string;
  isActive?: boolean;
  steps?: WorkflowStepInput[];
  createdBy: string;
}

export interface ListWorkflowsOptions {
  tenantId: string;
  orgId?: string;
  entityType?: string;
}

// Shape returned to the frontend. Matches what the existing in-memory
// store produced so the UI doesn't need to change.
function enrichWorkflow(row: any): any {
  const steps = (row.steps ?? []).map((s: any) => ({
    id: s.id,
    stepOrder: s.stepOrder,
    approverRole: s.approverRoleId ?? null,
    approverUserId: s.approverUserId ?? null,
    approverDepartmentId: s.approverDepartmentId ?? null,
    amountThresholdMin: s.amountThresholdMin?.toString?.() ?? null,
    amountThresholdMax: s.amountThresholdMax?.toString?.() ?? null,
    isConditional: !!s.isConditional,
  }));
  return {
    id: row.id,
    tenantId: row.tenantId,
    orgId: row.orgId,
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
  const where: Record<string, unknown> = { tenantId: opts.tenantId };
  if (opts.orgId) where.orgId = opts.orgId;
  if (opts.entityType) where.entityType = opts.entityType;

  const rows = await (db as any).cnApprovalWorkflow.findMany({
    where,
    include: { steps: { orderBy: { stepOrder: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(enrichWorkflow);
}

export async function findWorkflowById(
  tenantId: string,
  id: string,
): Promise<any | null> {
  const row = await (db as any).cnApprovalWorkflow.findFirst({
    where: { id, tenantId },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
  });
  return row ? enrichWorkflow(row) : null;
}

// ─── Mutations ──────────────────────────────────────────────────────

export async function createWorkflow(input: CreateWorkflowInput): Promise<any> {
  const row = await (db as any).cnApprovalWorkflow.create({
    data: {
      tenantId: input.tenantId,
      orgId: input.orgId,
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
  steps?: WorkflowStepInput[];
  updatedBy: string;
}

/**
 * Update a workflow. If `steps` is provided, the old steps are wiped and
 * replaced wholesale — simpler than trying to reconcile individual step
 * edits. If `steps` is `undefined`, existing steps are preserved.
 */
export async function updateWorkflow(
  tenantId: string,
  id: string,
  patch: UpdateWorkflowInput,
): Promise<any | null> {
  // Verify the row exists (and is tenant-scoped) before we touch steps.
  const existing = await (db as any).cnApprovalWorkflow.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  if (!existing) return null;

  const headerData: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.name !== undefined) headerData.name = patch.name;
  if (patch.entityType !== undefined) headerData.entityType = patch.entityType;
  if (patch.isActive !== undefined) headerData.isActive = patch.isActive;

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

  return findWorkflowById(tenantId, id);
}

export async function deleteWorkflow(
  tenantId: string,
  id: string,
): Promise<boolean> {
  const res = await (db as any).cnApprovalWorkflow.deleteMany({
    where: { id, tenantId },
  });
  return res.count > 0;
}
