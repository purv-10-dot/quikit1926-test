/**
 * Terms & Conditions master — Prisma-backed CRUD for `cn_terms_conditions`.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";

export interface TermsConditionRecord {
  id: string;
  orgId: string;
  title: string;
  body: string;
  applicableTo: string;
  isDefault: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function toRecord(row: Prisma.CnTermsConditionGetPayload<Record<string, never>>): TermsConditionRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    title: row.title ?? "",
    body: row.body ?? "",
    applicableTo: row.applicableTo ?? "general",
    isDefault: !!row.isDefault,
    status: row.status ?? "active",
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export interface ListTermsOptions {
  orgId: string;
  search?: string;
  applicableTo?: string;
  includeInactive?: boolean;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildTermsWhere(
  opts: Pick<
    ListTermsOptions,
    "orgId" | "search" | "applicableTo" | "includeInactive"
  >,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    ...(opts.applicableTo ? { applicableTo: opts.applicableTo } : {}),
    ...(opts.includeInactive
      ? { status: { not: "deleted" } }
      : { status: { notIn: ["inactive", "deleted"] } }),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { body: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listTermsConditions(
  opts: ListTermsOptions,
): Promise<TermsConditionRecord[]> {
  const rows = await db.cnTermsCondition.findMany({
    where: buildTermsWhere(opts),
    orderBy: { createdAt: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countTermsConditions(
  opts: Pick<
    ListTermsOptions,
    "orgId" | "search" | "applicableTo" | "includeInactive"
  >,
): Promise<number> {
  return db.cnTermsCondition.count({ where: buildTermsWhere(opts) });
}

export async function findTermsConditionById(
  orgId: string,
  id: string,
): Promise<TermsConditionRecord | null> {
  const row = await db.cnTermsCondition.findFirst({
    where: { id, orgId },
  });
  return row ? toRecord(row) : null;
}

export interface CreateTermsConditionInput {
  orgId: string;
  createdBy: string;
  title: string;
  body: string;
  applicableTo: string;
  isDefault?: boolean;
  status?: string;
}

export async function createTermsCondition(
  input: CreateTermsConditionInput,
): Promise<TermsConditionRecord> {
  const row = await db.cnTermsCondition.create({
    data: {
      orgId: input.orgId,
      title: input.title.trim(),
      body: input.body,
      applicableTo: input.applicableTo,
      isDefault: input.isDefault ?? false,
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
  return toRecord(row);
}

export interface UpdateTermsConditionInput
  extends Partial<Omit<CreateTermsConditionInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateTermsCondition(
  orgId: string,
  id: string,
  patch: UpdateTermsConditionInput,
): Promise<TermsConditionRecord | null> {
  const existing = await db.cnTermsCondition.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.body !== undefined) data.body = patch.body;
  if (patch.applicableTo !== undefined) data.applicableTo = patch.applicableTo;
  if (patch.isDefault !== undefined) data.isDefault = patch.isDefault;
  if (patch.status !== undefined) data.status = patch.status;

  const row = await db.cnTermsCondition.update({
    where: { id },
    data,
  });
  return toRecord(row);
}

export async function deleteTermsCondition(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await db.cnTermsCondition.updateMany({
    where: { id, orgId },
    data: { status: "deleted", updatedBy },
  });
  return res.count > 0;
}
