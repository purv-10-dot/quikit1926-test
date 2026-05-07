/**
 * Terms & Conditions master — Prisma-backed CRUD for `terms_conditions`.
 *
 * Tenant-scoped list/create/update, soft-delete via `status = "inactive"`.
 * The DB is the only source of truth: `prisma/seed.ts` populates the
 * canonical rows on a fresh database, and the list call does NOT auto-seed
 * so deletes persist.
 */

import { db } from "@/lib/db/prisma";

export interface TermsConditionRecord {
  id: string;
  tenantId: string;
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

function toRecord(row: any): TermsConditionRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
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

// ─── Public API ────────────────────────────────────────────────────

export interface ListTermsOptions {
  tenantId: string;
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
    "tenantId" | "orgId" | "search" | "applicableTo" | "includeInactive"
  >,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    tenantId: opts.tenantId,
    orgId: opts.orgId,
    ...(opts.applicableTo ? { applicableTo: opts.applicableTo } : {}),
    ...(opts.includeInactive ? {} : { status: { not: "inactive" } }),
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
  const rows = await (db as any).cnTermsCondition.findMany({
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
    "tenantId" | "orgId" | "search" | "applicableTo" | "includeInactive"
  >,
): Promise<number> {
  return (db as any).cnTermsCondition.count({ where: buildTermsWhere(opts) });
}

export async function findTermsConditionById(
  tenantId: string,
  id: string,
): Promise<TermsConditionRecord | null> {
  const row = await (db as any).cnTermsCondition.findFirst({
    where: { id, tenantId },
  });
  return row ? toRecord(row) : null;
}

export interface CreateTermsConditionInput {
  tenantId: string;
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
  const row = await (db as any).cnTermsCondition.create({
    data: {
      tenantId: input.tenantId,
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
  extends Partial<Omit<CreateTermsConditionInput, "tenantId" | "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateTermsCondition(
  tenantId: string,
  id: string,
  patch: UpdateTermsConditionInput,
): Promise<TermsConditionRecord | null> {
  const existing = await (db as any).cnTermsCondition.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.body !== undefined) data.body = patch.body;
  if (patch.applicableTo !== undefined) data.applicableTo = patch.applicableTo;
  if (patch.isDefault !== undefined) data.isDefault = patch.isDefault;
  if (patch.status !== undefined) data.status = patch.status;

  const row = await (db as any).cnTermsCondition.update({
    where: { id },
    data,
  });
  return toRecord(row);
}

export async function deleteTermsCondition(
  tenantId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  // Soft delete — keep row so PO/WO/RFQ references stay valid.
  const res = await (db as any).cnTermsCondition.updateMany({
    where: { id, tenantId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
