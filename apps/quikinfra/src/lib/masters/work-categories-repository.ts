/**
 * Work Categories master — Prisma-backed CRUD for `cn_work_categories`.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";

export interface WorkCategoryRecord {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  sortOrder: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function toRecord(row: Prisma.CnWorkCategoryGetPayload<Record<string, never>>): WorkCategoryRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    description: row.description ?? null,
    sortOrder: row.sortOrder ?? null,
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export interface ListWorkCategoriesOptions {
  orgId: string;
  createdBy: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildWorkCategoriesWhere(
  opts: Pick<ListWorkCategoriesOptions, "orgId" | "search">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listWorkCategories(
  opts: ListWorkCategoriesOptions,
): Promise<WorkCategoryRecord[]> {
  const rows = await db.cnWorkCategory.findMany({
    where: buildWorkCategoriesWhere(opts),
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countWorkCategories(
  opts: Pick<ListWorkCategoriesOptions, "orgId" | "search">,
): Promise<number> {
  return db.cnWorkCategory.count({
    where: buildWorkCategoriesWhere(opts),
  });
}

export async function findWorkCategoryById(
  orgId: string,
  id: string,
): Promise<WorkCategoryRecord | null> {
  const row = await db.cnWorkCategory.findFirst({ where: { id, orgId } });
  return row ? toRecord(row) : null;
}

export interface CreateWorkCategoryInput {
  orgId: string;
  createdBy: string;
  name: string;
  description?: string | null;
  sortOrder?: number | string | null;
  status?: string;
}

function sOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}
function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

export async function createWorkCategory(
  input: CreateWorkCategoryInput,
): Promise<WorkCategoryRecord> {
  const row = await db.cnWorkCategory.create({
    data: {
      orgId: input.orgId,
      name: String(input.name).trim(),
      description: sOrNull(input.description),
      sortOrder: toIntOrNull(input.sortOrder),
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
  return toRecord(row);
}

export interface UpdateWorkCategoryInput
  extends Partial<Omit<CreateWorkCategoryInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateWorkCategory(
  orgId: string,
  id: string,
  patch: UpdateWorkCategoryInput,
): Promise<WorkCategoryRecord | null> {
  const existing = await db.cnWorkCategory.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.name !== undefined) data.name = String(patch.name).trim();
  if (patch.description !== undefined) data.description = sOrNull(patch.description);
  if (patch.sortOrder !== undefined) data.sortOrder = toIntOrNull(patch.sortOrder);
  if (patch.status !== undefined) data.status = patch.status;

  const row = await db.cnWorkCategory.update({ where: { id }, data });
  return toRecord(row);
}

export async function deleteWorkCategory(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await db.cnWorkCategory.updateMany({
    where: { id, orgId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
