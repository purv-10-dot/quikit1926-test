/**
 * Labour Rate master — Prisma-backed, effective-dated wage registry.
 *
 * Business rules:
 *  - A rate belongs to a category, is scoped to a project OR tenant-wide
 *    (projectId null), has a rateType and an effective window.
 *  - New rates are created as DRAFT; only APPROVED rates are used by the system.
 *  - Resolution (resolveLabourRate): approved project-specific covering the date
 *    (newest effectiveFrom wins) → approved tenant-wide → null.
 *  - On approve: no overlapping APPROVED windows for the same
 *    (category, scope, rateType) — else LABOUR_RATE_OVERLAP (409); and the
 *    previous open-ended approved row is auto-closed (effectiveTo = newFrom - 1d).
 *  - Approved rows are never edited (history is frozen); a change is a new row.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";
import { DomainError } from "@/lib/http";

export const RATE_TYPES = ["DAILY_WAGE", "HOURLY_WAGE"] as const;
export type RateType = (typeof RATE_TYPES)[number];


export interface LabourRateRecord {
  id: string;
  orgId: string;
  labourCategoryId: string;
  categoryName: string | null;
  projectId: string | null;
  rateType: string;
  rate: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  approvalStatus: string;
  approvalId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

type RateRow = Prisma.CnLabourRateGetPayload<Record<string, never>>;

function toDateOnly(v: Date | null | undefined): string | null {
  if (!v) return null;
  return v.toISOString().slice(0, 10);
}

function toRecord(row: RateRow, categoryName?: string | null): LabourRateRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    labourCategoryId: row.labourCategoryId,
    categoryName: categoryName ?? null,
    projectId: row.projectId ?? null,
    rateType: row.rateType,
    rate: row.rate?.toString?.() ?? "0",
    effectiveFrom: toDateOnly(row.effectiveFrom) ?? "",
    effectiveTo: toDateOnly(row.effectiveTo),
    approvalStatus: row.approvalStatus,
    approvalId: row.approvalId ?? null,
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

/** Fetch category names for a set of ids in one query (avoids a Prisma relation). */
async function categoryNameMap(
  orgId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (!unique.length) return new Map();
  const cats = await db.cnLabourCategory.findMany({
    where: { orgId, id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(cats.map((c) => [c.id, c.name]));
}

export interface ListLabourRatesOptions {
  orgId: string;
  createdBy: string;
  search?: string;
  labourCategoryId?: string;
  projectId?: string;
  approvalStatus?: string;
  take?: number;
  skip?: number;
  status?: "active" | "inactive" | "all";
  orderBy?: Array<Record<string, "asc" | "desc">>;
}

type RateWhereOpts = Pick<
  ListLabourRatesOptions,
  "orgId" | "labourCategoryId" | "projectId" | "approvalStatus" | "status" | "search"
> & { searchCategoryIds?: string[] };

function buildWhere(opts: RateWhereOpts): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    ...(opts.labourCategoryId ? { labourCategoryId: opts.labourCategoryId } : {}),
    ...(opts.projectId ? { projectId: opts.projectId } : {}),
    ...(opts.approvalStatus ? { approvalStatus: opts.approvalStatus } : {}),
    ...(opts.status === "inactive"
      ? { status: "inactive" }
      : opts.status === "active"
        ? { status: { notIn: ["inactive", "deleted"] } }
        : { status: { not: "deleted" } }),
    ...(q
      ? {
          OR: [
            { rateType: { contains: q, mode: "insensitive" } },
            ...(opts.searchCategoryIds?.length
              ? [{ labourCategoryId: { in: opts.searchCategoryIds } }]
              : []),
          ],
        }
      : {}),
  };
}

/** Category ids whose name/code matches the free-text search (for server-side rate search). */
async function matchingCategoryIds(orgId: string, q: string): Promise<string[]> {
  const cats = await db.cnLabourCategory.findMany({
    where: {
      orgId,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  return cats.map((c) => c.id);
}

export async function listLabourRates(
  opts: ListLabourRatesOptions,
): Promise<LabourRateRecord[]> {
  const searchCategoryIds = opts.search?.trim()
    ? await matchingCategoryIds(opts.orgId, opts.search.trim())
    : undefined;
  const rows = await db.cnLabourRate.findMany({
    where: buildWhere({ ...opts, searchCategoryIds }),
    orderBy: opts.orderBy ?? [{ labourCategoryId: "asc" }, { effectiveFrom: "desc" }],
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  const names = await categoryNameMap(opts.orgId, rows.map((r) => r.labourCategoryId));
  return rows.map((r) => toRecord(r, names.get(r.labourCategoryId)));
}

export async function countLabourRates(opts: RateWhereOpts): Promise<number> {
  const searchCategoryIds = opts.search?.trim()
    ? await matchingCategoryIds(opts.orgId, opts.search.trim())
    : undefined;
  return db.cnLabourRate.count({ where: buildWhere({ ...opts, searchCategoryIds }) });
}

export async function findLabourRateById(
  orgId: string,
  id: string,
): Promise<LabourRateRecord | null> {
  const row = await db.cnLabourRate.findFirst({ where: { id, orgId } });
  if (!row) return null;
  const names = await categoryNameMap(orgId, [row.labourCategoryId]);
  return toRecord(row, names.get(row.labourCategoryId));
}

export interface CreateLabourRateInput {
  orgId: string;
  createdBy: string;
  labourCategoryId: string;
  projectId?: string | null;
  rateType: string;
  rate: number | string;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

function normalizeRateType(v: unknown): RateType {
  const s = String(v ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if ((RATE_TYPES as readonly string[]).includes(s)) return s as RateType;
  throw new DomainError("VALIDATION", `rateType must be one of ${RATE_TYPES.join(", ")}`, 400);
}

function parseDate(v: unknown, field: string): Date {
  const s = String(v ?? "").trim();
  const d = s ? new Date(s) : new Date("invalid");
  if (Number.isNaN(d.getTime())) {
    throw new DomainError("VALIDATION", `${field} must be a valid date`, 400);
  }
  return d;
}

export async function createLabourRate(
  input: CreateLabourRateInput,
): Promise<LabourRateRecord> {
  const from = parseDate(input.effectiveFrom, "effectiveFrom");
  const to = input.effectiveTo ? parseDate(input.effectiveTo, "effectiveTo") : null;
  if (to && to < from) {
    throw new DomainError("VALIDATION", "effectiveTo cannot be before effectiveFrom", 400);
  }
  const rateNum = Number(input.rate);
  if (!Number.isFinite(rateNum) || rateNum < 0) {
    throw new DomainError("VALIDATION", "rate must be a non-negative number", 400);
  }
  if (!input.projectId) {
    throw new DomainError("VALIDATION", "projectId is required", 400);
  }
  // ensure the category exists in this org
  const cat = await db.cnLabourCategory.findFirst({
    where: { id: input.labourCategoryId, orgId: input.orgId },
    select: { id: true },
  });
  if (!cat) throw new DomainError("VALIDATION", "labourCategoryId is invalid", 400);

  // Admin-managed master: rates are live on save (no submit/approve step).
  return db.$transaction(async (tx) => {
    const row = await tx.cnLabourRate.create({
      data: {
        orgId: input.orgId,
        labourCategoryId: input.labourCategoryId,
        projectId: input.projectId ? String(input.projectId) : null,
        rateType: normalizeRateType(input.rateType),
        rate: new Prisma.Decimal(input.rate),
        effectiveFrom: from,
        effectiveTo: to,
        approvalStatus: "APPROVED",
        status: "active",
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
    });
    await enforceNoOverlap(tx, input.orgId, row, input.createdBy);
    return toRecord(row);
  });
}

export interface UpdateLabourRateInput {
  updatedBy: string;
  rate?: number | string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
}

/** DRAFT-only edit. Approved rows are frozen. */
export async function updateLabourRate(
  orgId: string,
  id: string,
  patch: UpdateLabourRateInput,
): Promise<LabourRateRecord | null> {
  const existing = await db.cnLabourRate.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.rate !== undefined) {
    const rateNum = Number(patch.rate);
    if (!Number.isFinite(rateNum) || rateNum < 0) {
      throw new DomainError("VALIDATION", "rate must be a non-negative number", 400);
    }
    data.rate = new Prisma.Decimal(patch.rate);
  }
  if (patch.effectiveFrom !== undefined)
    data.effectiveFrom = parseDate(patch.effectiveFrom, "effectiveFrom");
  if (patch.effectiveTo !== undefined)
    data.effectiveTo = patch.effectiveTo ? parseDate(patch.effectiveTo, "effectiveTo") : null;

  return db.$transaction(async (tx) => {
    const row = await tx.cnLabourRate.update({ where: { id }, data });
    await enforceNoOverlap(tx, orgId, row, patch.updatedBy);
    return toRecord(row);
  });
}

export async function submitLabourRate(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<LabourRateRecord | null> {
  const existing = await db.cnLabourRate.findFirst({
    where: { id, orgId },
    select: { id: true, approvalStatus: true },
  });
  if (!existing) return null;
  if (existing.approvalStatus !== "DRAFT" && existing.approvalStatus !== "REJECTED") {
    throw new DomainError("INVALID_TRANSITION", "Only DRAFT/REJECTED rates can be submitted", 409);
  }
  const row = await db.cnLabourRate.update({
    where: { id },
    data: { approvalStatus: "PENDING", updatedBy },
  });
  return toRecord(row);
}

function windowsOverlap(
  aFrom: Date, aTo: Date | null,
  bFrom: Date, bTo: Date | null,
): boolean {
  const aEnd = aTo ? aTo.getTime() : Infinity;
  const bEnd = bTo ? bTo.getTime() : Infinity;
  return aFrom.getTime() <= bEnd && bFrom.getTime() <= aEnd;
}

/**
 * Guard against overlapping live rates for the same (category, scope, rateType).
 * A previous open-ended rate is auto-closed (effectiveTo = newFrom - 1 day);
 * any other overlap throws LABOUR_RATE_OVERLAP. Runs inside a transaction.
 */
async function enforceNoOverlap(
  tx: Prisma.TransactionClient,
  orgId: string,
  target: RateRow,
  updatedBy: string,
): Promise<void> {
  const peers = await tx.cnLabourRate.findMany({
    where: {
      orgId,
      labourCategoryId: target.labourCategoryId,
      projectId: target.projectId,
      rateType: target.rateType,
      approvalStatus: "APPROVED",
      status: { not: "deleted" },
      id: { not: target.id },
    },
  });
  for (const p of peers) {
    if (windowsOverlap(target.effectiveFrom, target.effectiveTo, p.effectiveFrom, p.effectiveTo)) {
      const isPriorOpen = p.effectiveTo === null && p.effectiveFrom < target.effectiveFrom;
      if (isPriorOpen) {
        const closeAt = new Date(target.effectiveFrom.getTime() - 86_400_000);
        await tx.cnLabourRate.update({ where: { id: p.id }, data: { effectiveTo: closeAt, updatedBy } });
      } else {
        throw new DomainError(
          "LABOUR_RATE_OVERLAP",
          `Rate window overlaps an existing rate (${p.id})`,
          409,
        );
      }
    }
  }
}

/**
 * Approve a rate: overlap guard on (category, scope, rateType), auto-close the
 * previous open-ended approved row, flip to APPROVED — all in one transaction.
 */
export async function approveLabourRate(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<LabourRateRecord | null> {
  return db.$transaction(async (tx) => {
    const target = await tx.cnLabourRate.findFirst({ where: { id, orgId } });
    if (!target) return null;
    if (target.approvalStatus === "APPROVED") return toRecord(target);

    // all currently-approved rates for the same key
    const peers = await tx.cnLabourRate.findMany({
      where: {
        orgId,
        labourCategoryId: target.labourCategoryId,
        projectId: target.projectId,
        rateType: target.rateType,
        approvalStatus: "APPROVED",
        status: { not: "deleted" },
        id: { not: id },
      },
    });

    for (const p of peers) {
      if (windowsOverlap(target.effectiveFrom, target.effectiveTo, p.effectiveFrom, p.effectiveTo)) {
        // auto-close a previous open-ended row that starts before this one
        const isPriorOpen =
          p.effectiveTo === null && p.effectiveFrom < target.effectiveFrom;
        if (isPriorOpen) {
          const closeAt = new Date(target.effectiveFrom.getTime() - 86_400_000);
          await tx.cnLabourRate.update({
            where: { id: p.id },
            data: { effectiveTo: closeAt, updatedBy },
          });
        } else {
          throw new DomainError(
            "LABOUR_RATE_OVERLAP",
            `Approved rate window overlaps an existing rate (${p.id})`,
            409,
          );
        }
      }
    }

    const row = await tx.cnLabourRate.update({
      where: { id },
      data: { approvalStatus: "APPROVED", updatedBy },
    });
    return toRecord(row);
  });
}

export async function deleteLabourRate(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const existing = await db.cnLabourRate.findFirst({
    where: { id, orgId },
    select: { approvalStatus: true },
  });
  if (existing && existing.approvalStatus === "APPROVED") {
    throw new DomainError(
      "LABOUR_RATE_NOT_EDITABLE",
      "Approved rates cannot be deleted; supersede with a new dated rate instead",
      409,
    );
  }
  const res = await db.cnLabourRate.updateMany({
    where: { id, orgId },
    data: { status: "deleted", updatedBy },
  });
  return res.count > 0;
}

/**
 * Resolve the effective rate for a category on a project as of a date.
 * Project-specific approved (newest start) → tenant-wide approved → null.
 */
export async function resolveLabourRate(params: {
  orgId: string;
  labourCategoryId: string;
  projectId?: string | null;
  rateType?: RateType;
  onDate: Date;
}): Promise<LabourRateRecord | null> {
  const { orgId, labourCategoryId, projectId, rateType, onDate } = params;

  const covering = (rows: RateRow[]): RateRow | null => {
    const eligible = rows
      .filter((r) => r.effectiveFrom <= onDate && (r.effectiveTo === null || r.effectiveTo >= onDate))
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
    return eligible[0] ?? null;
  };

  const baseWhere = {
    orgId,
    labourCategoryId,
    approvalStatus: "APPROVED",
    status: { not: "deleted" },
    ...(rateType ? { rateType } : {}),
  } as const;

  if (projectId) {
    const proj = await db.cnLabourRate.findMany({ where: { ...baseWhere, projectId } });
    const hit = covering(proj);
    if (hit) return toRecord(hit);
  }
  const tenant = await db.cnLabourRate.findMany({ where: { ...baseWhere, projectId: null } });
  const hit = covering(tenant);
  return hit ? toRecord(hit) : null;
}
