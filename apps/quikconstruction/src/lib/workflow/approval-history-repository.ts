/**
 * Approval History — read-side helpers around `approval_history`.
 *
 * Writes are performed inside the approval action transaction by
 * `recordApprovalAction` in `src/lib/workflow/audit.ts` (called from
 * `approvalService.execute`). Don't bypass that — actions and history
 * rows must commit together with the instance status update.
 *
 * Resolves `actionById` to a display-friendly name via a single batched
 * lookup against `users` so the audit-trail UI can show "Approved by
 * Priya Kulkarni" without a second query per row.
 */

import { db } from "@/lib/db/prisma";

export interface ApprovalHistoryRecord {
  id: string;
  instanceId: string;
  stepOrder: number;
  action: string;
  actionById: string;
  actionByName: string;
  actionAt: string;
  comments: string | null;
}

export async function listHistoryForInstance(
  instanceId: string,
): Promise<ApprovalHistoryRecord[]> {
  const rows = await (db as any).cnApprovalHistory.findMany({
    where: { instanceId },
    orderBy: { actionAt: "asc" },
  });

  if (rows.length === 0) return [];

  const userIds = Array.from(new Set(rows.map((r: any) => r.actionById)));
  const users = userIds.length
    ? await (db as any).cnUser.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true },
      })
    : [];
  const nameById = new Map<string, string>(
    users.map((u: any) => [u.id, u.fullName]),
  );

  return rows.map((r: any) => ({
    id: r.id,
    instanceId: r.instanceId,
    stepOrder: r.stepOrder,
    action: r.action,
    actionById: r.actionById,
    actionByName: nameById.get(r.actionById) ?? r.actionById,
    actionAt: r.actionAt?.toISOString?.() ?? "",
    comments: r.comments ?? null,
  }));
}
