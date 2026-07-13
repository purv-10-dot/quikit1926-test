/**
 * Departments master — Prisma-backed CRUD for `cn_departments`.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";

export interface DepartmentRecord {
  id: string;
  orgId: string;
  code: string;
  name: string;
  costCenter: string | null;
  headUserId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function toRecord(row: Prisma.CnDepartmentGetPayload<Record<string, never>>): DepartmentRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    code: row.code,
    name: row.name,
    costCenter: row.costCenter ?? null,
    headUserId: row.headUserId ?? null,
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export interface ListDepartmentsOptions {
  orgId: string;
  createdBy: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildDepartmentsWhere(
  opts: Pick<ListDepartmentsOptions, "orgId" | "search">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    // "deleted" is the hard-soft-delete marker: those rows are gone from the
    // UI entirely (neither the active nor the Inactive tab shows them).
    // "inactive" rows are still returned so the Inactive tab can list them.
    status: { not: "deleted" },
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { costCenter: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listDepartments(opts: ListDepartmentsOptions): Promise<DepartmentRecord[]> {
  const rows = await db.cnDepartment.findMany({
    where: buildDepartmentsWhere(opts),
    orderBy: { createdAt: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countDepartments(
  opts: Pick<ListDepartmentsOptions, "orgId" | "search">,
): Promise<number> {
  return db.cnDepartment.count({ where: buildDepartmentsWhere(opts) });
}

export async function findDepartmentById(orgId: string, id: string): Promise<DepartmentRecord | null> {
  const row = await db.cnDepartment.findFirst({ where: { id, orgId } });
  return row ? toRecord(row) : null;
}

export interface CreateDepartmentInput {
  orgId: string;
  createdBy: string;
  code: string;
  name: string;
  costCenter?: string | null;
  headUserId?: string | null;
  status?: string;
}

function sOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export async function createDepartment(input: CreateDepartmentInput): Promise<DepartmentRecord> {
  const row = await db.cnDepartment.create({
    data: {
      orgId: input.orgId,
      code: String(input.code).trim(),
      name: String(input.name).trim(),
      costCenter: sOrNull(input.costCenter),
      headUserId: sOrNull(input.headUserId),
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
  return toRecord(row);
}

export interface UpdateDepartmentInput
  extends Partial<Omit<CreateDepartmentInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateDepartment(
  orgId: string,
  id: string,
  patch: UpdateDepartmentInput,
): Promise<DepartmentRecord | null> {
  const existing = await db.cnDepartment.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.code !== undefined) data.code = String(patch.code).trim();
  if (patch.name !== undefined) data.name = String(patch.name).trim();
  if (patch.costCenter !== undefined) data.costCenter = sOrNull(patch.costCenter);
  if (patch.headUserId !== undefined) data.headUserId = sOrNull(patch.headUserId);
  if (patch.status !== undefined) data.status = patch.status;

  const row = await db.cnDepartment.update({ where: { id }, data });
  return toRecord(row);
}

export async function deleteDepartment(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await db.cnDepartment.updateMany({
    where: { id, orgId },
    data: { status: "deleted", updatedBy },
  });
  return res.count > 0;
}
