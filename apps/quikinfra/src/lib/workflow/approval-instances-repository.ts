/**
 * Approval Instances master — read-side helpers around `cn_approval_instances`.
 *
 * Writes happen inside transactions in the entity-specific submit routes
 * (see `app/api/.../submit/route.ts` files which call
 * `tx.cnApprovalInstance.create(...)`) and inside `approvalService.execute`,
 * so we don't expose a generic `createInstance` here — that would invite
 * untransacted writes.
 *
 * This module is the canonical place for read queries used by the
 * approvals inbox, history viewer, and dashboard counters.
 */

import { db } from "@/lib/db";

export interface ApprovalInstanceRecord {
  id: string;
  orgId: string;
  workflowId: string;
  entityType: string;
  entityId: string;
  entityNumber: string;
  currentStepOrder: number;
  status: string;
  requestedById: string;
  requestedAt: string;
  completedAt: string | null;
}

function toRecord(row: any): ApprovalInstanceRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    workflowId: row.workflowId,
    entityType: row.entityType,
    entityId: row.entityId,
    entityNumber: row.entityNumber,
    currentStepOrder: row.currentStepOrder,
    status: row.status,
    requestedById: row.requestedById,
    requestedAt: row.requestedAt?.toISOString?.() ?? "",
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export async function findInstanceById(
  orgId: string,
  id: string,
): Promise<ApprovalInstanceRecord | null> {
  const row = await (db as any).cnApprovalInstance.findFirst({
    where: { id, orgId },
  });
  return row ? toRecord(row) : null;
}

export interface ListPendingOptions {
  orgId: string;
  entityType?: string;
}

export async function listPendingInstances(
  opts: ListPendingOptions,
): Promise<ApprovalInstanceRecord[]> {
  const rows = await (db as any).cnApprovalInstance.findMany({
    where: {
      orgId: opts.orgId,
      status: "pending_approval",
      ...(opts.entityType && opts.entityType !== "all"
        ? { entityType: opts.entityType }
        : {}),
    },
    orderBy: { requestedAt: "desc" },
  });
  return rows.map(toRecord);
}

export async function countPendingInstances(opts: {
  orgId: string;
}): Promise<number> {
  return (db as any).cnApprovalInstance.count({
    where: {
      orgId: opts.orgId,
      status: "pending_approval",
    },
  });
}
