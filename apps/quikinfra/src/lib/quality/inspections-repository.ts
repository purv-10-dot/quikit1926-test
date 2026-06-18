/**
 * QC Inspection master — Prisma-backed CRUD for `CnQCInspection`.
 *
 * Backs the combined inspection+checklist workflow on the /quality page.
 * The model is also used for GRN quality decisions (decision/grnId), so the
 * /quality-specific columns (boqItem, checklistName, category, result, items)
 * are nullable and left untouched by that flow.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";

export interface InspectionRecord {
  id: string;
  inspectionNo: string;
  projectId: string | null;
  boqItem: string | null;
  checklistName: string | null;
  category: string | null;
  inspector: string | null;
  inspectorId: string;
  date: string;
  result: string | null;
  decision: string;
  status: string | null;
  remarks: string | null;
  items: unknown[];
}

function toRecord(row: Prisma.CnQCInspectionGetPayload<Record<string, never>>): InspectionRecord {
  return {
    id: row.id,
    inspectionNo: row.inspectionNumber,
    projectId: row.projectId ?? null,
    boqItem: row.boqItem ?? null,
    checklistName: row.checklistName ?? null,
    category: row.category ?? null,
    inspector: row.inspectorName ?? null,
    inspectorId: row.inspectorId,
    date: row.inspectionDate?.toISOString?.().slice(0, 10) ?? "",
    result: row.result ?? null,
    decision: row.decision ?? "pending",
    status: row.status ?? null,
    remarks: row.remarks ?? null,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

/** UI result (Pass/Fail/Conditional) → CnQCInspection.decision vocabulary. */
function resultToDecision(result?: string | null): string {
  switch ((result ?? "").toLowerCase()) {
    case "pass":
      return "accepted";
    case "fail":
      return "rejected";
    case "conditional":
      return "conditional";
    default:
      return "pending";
  }
}

export interface ListInspectionsOptions {
  orgId: string;
  search?: string;
  projectId?: string;
  /** Restrict to a set of project ids (per-user project scoping). */
  projectIds?: string[];
  take?: number;
  skip?: number;
}

function buildWhere(
  opts: Pick<ListInspectionsOptions, "orgId" | "search" | "projectId" | "projectIds">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    deletedAt: null,
    ...(opts.projectId ? { projectId: opts.projectId } : {}),
    ...(opts.projectIds ? { projectId: { in: opts.projectIds } } : {}),
    ...(q
      ? {
          OR: [
            { inspectionNumber: { contains: q, mode: "insensitive" } },
            { boqItem: { contains: q, mode: "insensitive" } },
            { inspectorName: { contains: q, mode: "insensitive" } },
            { checklistName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listInspections(
  opts: ListInspectionsOptions,
): Promise<InspectionRecord[]> {
  const rows = await db.cnQCInspection.findMany({
    where: buildWhere(opts),
    orderBy: { inspectionDate: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countInspections(
  opts: Pick<ListInspectionsOptions, "orgId" | "search" | "projectId" | "projectIds">,
): Promise<number> {
  return db.cnQCInspection.count({ where: buildWhere(opts) });
}

export async function findInspectionById(
  orgId: string,
  id: string,
): Promise<InspectionRecord | null> {
  const row = await db.cnQCInspection.findFirst({
    where: { id, orgId, deletedAt: null },
  });
  return row ? toRecord(row) : null;
}

/**
 * Next per-org, per-year inspection number: `QI-<year>-<seq>` (seq zero-padded
 * to 3). Counts existing numbers with the same year prefix. The unique index
 * on (orgId, inspectionNumber) is the real guard against collisions.
 */
async function nextInspectionNumber(orgId: string, year: number): Promise<string> {
  const prefix = `QI-${year}-`;
  const count = await db.cnQCInspection.count({
    where: { orgId, inspectionNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(3, "0")}`;
}

export interface CreateInspectionInput {
  orgId: string;
  createdBy: string;
  inspectorId: string;
  inspectorName?: string | null;
  projectId?: string | null;
  inspectionDate: Date;
  boqItem?: string | null;
  checklistName?: string | null;
  category?: string | null;
  result?: string | null;
  status?: string | null;
  remarks?: string | null;
  items?: unknown[];
}

export async function createInspection(
  input: CreateInspectionInput,
): Promise<InspectionRecord> {
  const year = input.inspectionDate.getUTCFullYear();
  const inspectionNumber = await nextInspectionNumber(input.orgId, year);
  const row = await db.cnQCInspection.create({
    data: {
      orgId: input.orgId,
      inspectionNumber,
      projectId: input.projectId ?? null,
      inspectorId: input.inspectorId,
      inspectorName: input.inspectorName ?? null,
      inspectionDate: input.inspectionDate,
      decision: resultToDecision(input.result),
      result: input.result ?? null,
      boqItem: input.boqItem ?? null,
      checklistName: input.checklistName ?? null,
      category: input.category ?? null,
      status: input.status ?? "Active",
      remarks: input.remarks ?? null,
      items: (input.items ?? []) as Prisma.InputJsonValue,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
  return toRecord(row);
}

export interface UpdateInspectionInput {
  updatedBy: string;
  projectId?: string | null;
  boqItem?: string | null;
  checklistName?: string | null;
  category?: string | null;
  result?: string | null;
  status?: string | null;
  remarks?: string | null;
  items?: unknown[];
}

export async function updateInspection(
  orgId: string,
  id: string,
  patch: UpdateInspectionInput,
): Promise<InspectionRecord | null> {
  const existing = await db.cnQCInspection.findFirst({
    where: { id, orgId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.projectId !== undefined) data.projectId = patch.projectId;
  if (patch.boqItem !== undefined) data.boqItem = patch.boqItem;
  if (patch.checklistName !== undefined) data.checklistName = patch.checklistName;
  if (patch.category !== undefined) data.category = patch.category;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.remarks !== undefined) data.remarks = patch.remarks;
  if (patch.items !== undefined) data.items = patch.items;
  if (patch.result !== undefined) {
    data.result = patch.result;
    data.decision = resultToDecision(patch.result);
  }

  const row = await db.cnQCInspection.update({ where: { id }, data });
  return toRecord(row);
}

export async function softDeleteInspection(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await db.cnQCInspection.updateMany({
    where: { id, orgId, deletedAt: null },
    data: { deletedAt: new Date(), updatedBy },
  });
  return res.count > 0;
}
