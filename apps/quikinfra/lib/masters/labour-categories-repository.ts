/**
 * Labour Category master — Prisma-backed CRUD for `Labour_categories`.
 *
 * Business rules:
 *  - `code` is immutable after create (LABOUR_CATEGORY_CODE_IMMUTABLE).
 *  - Cannot deactivate a category still referenced by an active workman
 *    (LABOUR_CATEGORY_IN_USE). Muster / labour-WO checks are added in their
 *    own sections once those tables exist.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";
import { DomainError } from "@/lib/http";

export const SKILL_LEVELS = [
  "UNSKILLED",
  "SEMI_SKILLED",
  "SKILLED",
  "HIGHLY_SKILLED",
] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export interface LabourCategoryRecord {
  id: string;
  orgId: string;
  code: string;
  name: string;
  skillLevel: string;
  trade: string | null;
  defaultUomId: string | null;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function toRecord(
  row: Prisma.CnLabourCategoryGetPayload<Record<string, never>>,
): LabourCategoryRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    code: row.code,
    name: row.name,
    skillLevel: row.skillLevel,
    trade: row.trade ?? null,
    defaultUomId: row.defaultUomId ?? null,
    description: row.description ?? null,
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export interface ListLabourCategoriesOptions {
  orgId: string;
  createdBy: string;
  search?: string;
  take?: number;
  skip?: number;
  status?: "active" | "inactive" | "all";
  orderBy?: Array<Record<string, "asc" | "desc">>;
}

function buildWhere(
  opts: Pick<ListLabourCategoriesOptions, "orgId" | "search" | "status">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    ...(opts.status === "inactive"
      ? { status: "inactive" }
      : opts.status === "active"
        ? { status: { notIn: ["inactive", "deleted"] } }
        : { status: { not: "deleted" } }),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { trade: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listLabourCategories(
  opts: ListLabourCategoriesOptions,
): Promise<LabourCategoryRecord[]> {
  const rows = await db.cnLabourCategory.findMany({
    where: buildWhere(opts),
    orderBy: opts.orderBy ?? { code: "asc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countLabourCategories(
  opts: Pick<ListLabourCategoriesOptions, "orgId" | "search" | "status">,
): Promise<number> {
  return db.cnLabourCategory.count({ where: buildWhere(opts) });
}

export async function findLabourCategoryById(
  orgId: string,
  id: string,
): Promise<LabourCategoryRecord | null> {
  const row = await db.cnLabourCategory.findFirst({ where: { id, orgId } });
  return row ? toRecord(row) : null;
}

export interface CreateLabourCategoryInput {
  orgId: string;
  createdBy: string;
  code: string;
  name: string;
  skillLevel: string;
  trade?: string | null;
  defaultUomId?: string | null;
  description?: string | null;
  status?: string;
}

function normalizeSkill(v: unknown): SkillLevel {
  const s = String(v ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if ((SKILL_LEVELS as readonly string[]).includes(s)) return s as SkillLevel;
  throw new DomainError(
    "VALIDATION",
    `skillLevel must be one of ${SKILL_LEVELS.join(", ")}`,
    400,
  );
}

export async function createLabourCategory(
  input: CreateLabourCategoryInput,
): Promise<LabourCategoryRecord> {
  if (!String(input.code ?? "").trim()) {
    throw new DomainError("VALIDATION", "Category code is required", 400);
  }
  if (!String(input.name ?? "").trim()) {
    throw new DomainError("VALIDATION", "Category name is required", 400);
  }
  const row = await db.cnLabourCategory.create({
    data: {
      orgId: input.orgId,
      code: String(input.code).trim().toUpperCase(),
      name: String(input.name).trim(),
      skillLevel: normalizeSkill(input.skillLevel),
      trade: input.trade ? String(input.trade).trim() : null,
      defaultUomId: input.defaultUomId ? String(input.defaultUomId) : null,
      description: input.description ? String(input.description).trim() : null,
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
  return toRecord(row);
}

export interface UpdateLabourCategoryInput
  extends Partial<Omit<CreateLabourCategoryInput, "orgId" | "createdBy" | "code">> {
  updatedBy: string;
  /** Present only so we can reject an attempted code change explicitly. */
  code?: string;
}

export async function updateLabourCategory(
  orgId: string,
  id: string,
  patch: UpdateLabourCategoryInput,
): Promise<LabourCategoryRecord | null> {
  const existing = await db.cnLabourCategory.findFirst({
    where: { id, orgId },
    select: { id: true, code: true, status: true },
  });
  if (!existing) return null;

  // code is immutable after create
  if (
    patch.code !== undefined &&
    String(patch.code).trim().toUpperCase() !== existing.code
  ) {
    throw new DomainError(
      "LABOUR_CATEGORY_CODE_IMMUTABLE",
      "Labour category code cannot be changed after creation",
      409,
    );
  }

  // block deactivation while still in use
  if (patch.status === "inactive" && existing.status !== "inactive") {
    await assertNotInUse(orgId, id);
  }

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.name !== undefined) data.name = String(patch.name).trim();
  if (patch.skillLevel !== undefined) data.skillLevel = normalizeSkill(patch.skillLevel);
  if (patch.trade !== undefined) data.trade = patch.trade ? String(patch.trade).trim() : null;
  if (patch.defaultUomId !== undefined)
    data.defaultUomId = patch.defaultUomId ? String(patch.defaultUomId) : null;
  if (patch.description !== undefined)
    data.description = patch.description ? String(patch.description).trim() : null;
  if (patch.status !== undefined) data.status = patch.status;

  const row = await db.cnLabourCategory.update({ where: { id }, data });
  return toRecord(row);
}

/** Throws LABOUR_CATEGORY_IN_USE (409) if an active workman references it. */
async function assertNotInUse(orgId: string, categoryId: string): Promise<void> {
  const workmen = await db.cnWorkman.count({
    where: { orgId, labourCategoryId: categoryId, status: { not: "deleted" } },
  });
  if (workmen > 0) {
    throw new DomainError(
      "LABOUR_CATEGORY_IN_USE",
      `Category is referenced by ${workmen} workman record(s) and cannot be deactivated`,
      409,
    );
  }
}

export async function deleteLabourCategory(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  await assertNotInUse(orgId, id);
  const res = await db.cnLabourCategory.updateMany({
    where: { id, orgId },
    data: { status: "deleted", updatedBy },
  });
  return res.count > 0;
}
