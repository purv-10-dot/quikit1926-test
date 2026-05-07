/**
 * Departments master — Prisma-backed CRUD for `departments`.
 */

import { db } from "@/lib/db/prisma";

export interface DepartmentRecord {
  id: string;
  tenantId: string;
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

function toRecord(row: any): DepartmentRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
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
  tenantId: string;
  orgId: string;
  createdBy: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildDepartmentsWhere(
  opts: Pick<ListDepartmentsOptions, "tenantId" | "orgId" | "search">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    tenantId: opts.tenantId,
    orgId: opts.orgId,
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
  const rows = await (db as any).cnDepartment.findMany({
    where: buildDepartmentsWhere(opts),
    orderBy: { createdAt: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countDepartments(
  opts: Pick<ListDepartmentsOptions, "tenantId" | "orgId" | "search">,
): Promise<number> {
  return (db as any).cnDepartment.count({ where: buildDepartmentsWhere(opts) });
}

export async function findDepartmentById(tenantId: string, id: string): Promise<DepartmentRecord | null> {
  const row = await (db as any).cnDepartment.findFirst({ where: { id, tenantId } });
  return row ? toRecord(row) : null;
}

export interface CreateDepartmentInput {
  tenantId: string;
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
  const row = await (db as any).cnDepartment.create({
    data: {
      tenantId: input.tenantId,
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
  extends Partial<Omit<CreateDepartmentInput, "tenantId" | "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateDepartment(
  tenantId: string,
  id: string,
  patch: UpdateDepartmentInput,
): Promise<DepartmentRecord | null> {
  const existing = await (db as any).cnDepartment.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.code !== undefined) data.code = String(patch.code).trim();
  if (patch.name !== undefined) data.name = String(patch.name).trim();
  if (patch.costCenter !== undefined) data.costCenter = sOrNull(patch.costCenter);
  if (patch.headUserId !== undefined) data.headUserId = sOrNull(patch.headUserId);
  if (patch.status !== undefined) data.status = patch.status;

  const row = await (db as any).cnDepartment.update({ where: { id }, data });
  return toRecord(row);
}

export async function deleteDepartment(
  tenantId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await (db as any).cnDepartment.updateMany({
    where: { id, tenantId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
