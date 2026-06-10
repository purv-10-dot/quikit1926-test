/**
 * Safety/quality checklist master — Prisma-backed CRUD for `CnSafetyChecklist`.
 * Backs the "Total Checklists" count and the checklists list on /quality.
 */

import { db } from "@/lib/db";

export interface ChecklistRecord {
  id: string;
  name: string;
  projectId: string | null;
  date: string;
  status: string;
  remarks: string | null;
  items: unknown[];
  itemsCount: number;
}

function toRecord(row: any): ChecklistRecord {
  const items = Array.isArray(row.items) ? row.items : [];
  return {
    id: row.id,
    name: row.templateName ?? "",
    projectId: row.projectId ?? null,
    date: row.checklistDate?.toISOString?.().slice(0, 10) ?? "",
    status: row.overallStatus ?? "pass",
    remarks: row.remarks ?? null,
    items,
    itemsCount: items.length,
  };
}

export interface ListChecklistsOptions {
  orgId: string;
  search?: string;
  projectIds?: string[];
  take?: number;
  skip?: number;
}

function buildWhere(
  opts: Pick<ListChecklistsOptions, "orgId" | "search" | "projectIds">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    deletedAt: null,
    ...(opts.projectIds ? { projectId: { in: opts.projectIds } } : {}),
    ...(q ? { templateName: { contains: q, mode: "insensitive" } } : {}),
  };
}

export async function listChecklists(
  opts: ListChecklistsOptions,
): Promise<ChecklistRecord[]> {
  const rows = await (db as any).cnSafetyChecklist.findMany({
    where: buildWhere(opts),
    orderBy: { checklistDate: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countChecklists(
  opts: Pick<ListChecklistsOptions, "orgId" | "search" | "projectIds">,
): Promise<number> {
  return (db as any).cnSafetyChecklist.count({ where: buildWhere(opts) });
}

export interface CreateChecklistInput {
  orgId: string;
  createdBy: string;
  templateName: string;
  projectId?: string | null;
  checklistDate: Date;
  completedBy: string;
  items?: unknown[];
  overallStatus?: string;
  remarks?: string | null;
}

export async function createChecklist(
  input: CreateChecklistInput,
): Promise<ChecklistRecord> {
  const row = await (db as any).cnSafetyChecklist.create({
    data: {
      orgId: input.orgId,
      templateName: input.templateName,
      projectId: input.projectId ?? null,
      checklistDate: input.checklistDate,
      completedBy: input.completedBy,
      items: input.items ?? [],
      overallStatus: input.overallStatus ?? "pass",
      remarks: input.remarks ?? null,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
  return toRecord(row);
}
