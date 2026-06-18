/**
 * Cost Centers master — Prisma-backed CRUD for `cn_cost_centers`.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";

export interface CostCenterRecord {
  id: string;
  orgId: string;
  code: string;
  name: string;
  projectId: string | null;
  projectName: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function toRecord(row: Prisma.CnCostCenterGetPayload<Record<string, never>> & { project?: { id: string; name: string } | null }): CostCenterRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    code: row.code,
    name: row.name,
    projectId: row.projectId ?? null,
    projectName: row.project?.name ?? null,
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function sOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export interface ListOptions {
  orgId: string;
  createdBy: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildCostCentersWhere(
  opts: Pick<ListOptions, "orgId" | "search">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listCostCenters(opts: ListOptions): Promise<CostCenterRecord[]> {
  const rows = await db.cnCostCenter.findMany({
    where: buildCostCentersWhere(opts),
    include: { project: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countCostCenters(
  opts: Pick<ListOptions, "orgId" | "search">,
): Promise<number> {
  return db.cnCostCenter.count({ where: buildCostCentersWhere(opts) });
}

export async function findCostCenterById(orgId: string, id: string): Promise<CostCenterRecord | null> {
  const row = await db.cnCostCenter.findFirst({ where: { id, orgId } });
  return row ? toRecord(row) : null;
}

export interface CreateCostCenterInput {
  orgId: string;
  createdBy: string;
  code: string;
  name: string;
  projectId?: string | null;
  status?: string;
}

export async function createCostCenter(input: CreateCostCenterInput): Promise<CostCenterRecord> {
  const row = await db.cnCostCenter.create({
    data: {
      orgId: input.orgId,
      code: String(input.code).trim(),
      name: String(input.name).trim(),
      projectId: sOrNull(input.projectId),
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
  return toRecord(row);
}

export interface UpdateCostCenterInput
  extends Partial<Omit<CreateCostCenterInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateCostCenter(
  orgId: string,
  id: string,
  patch: UpdateCostCenterInput,
): Promise<CostCenterRecord | null> {
  const existing = await db.cnCostCenter.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.code !== undefined) data.code = String(patch.code).trim();
  if (patch.name !== undefined) data.name = String(patch.name).trim();
  if (patch.projectId !== undefined) data.projectId = sOrNull(patch.projectId);
  if (patch.status !== undefined) data.status = patch.status;

  const row = await db.cnCostCenter.update({ where: { id }, data });
  return toRecord(row);
}

export async function deleteCostCenter(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await db.cnCostCenter.updateMany({
    where: { id, orgId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
