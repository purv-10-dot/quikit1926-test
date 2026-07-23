/**
 * Workman master — individual labour identity.
 *
 * Business rules:
 *  - workmanCode auto-generated WM-#### (tenant-unique), retry on collision.
 *  - PII (hard): only the LAST 4 chars of ID proof / bank account are stored.
 *    Anything longer is rejected (WORKMAN_PII_INVALID). Full numbers never hit DB.
 *  - engagementType CONTRACTOR requires contractorId; DEPARTMENTAL requires it
 *    null (WORKMAN_CONTRACTOR_MISMATCH).
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";
import { DomainError } from "@/lib/http";
import { withDocNumberRetry } from "@/lib/db/doc-number";

export const ENGAGEMENT_TYPES = ["CONTRACTOR", "DEPARTMENTAL"] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];

export interface WorkmanRecord {
  id: string;
  orgId: string;
  workmanCode: string;
  fullName: string;
  fatherOrSpouse: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  photoFileId: string | null;
  idProofType: string | null;
  idProofLast4: string | null;
  labourCategoryId: string;
  categoryName: string | null;
  engagementType: string;
  contractorId: string | null;
  dailyWage: string | null;
  bankAccountLast4: string | null;
  ifsc: string | null;
  joiningDate: string | null;
  exitDate: string | null;
  projectIds: string[];
  safetyInductionDone: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

type WorkmanRow = Prisma.CnWorkmanGetPayload<Record<string, never>>;

function toDateOnly(v: Date | null | undefined): string | null {
  return v ? v.toISOString().slice(0, 10) : null;
}

function toRecord(row: WorkmanRow, categoryName?: string | null): WorkmanRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    workmanCode: row.workmanCode,
    fullName: row.fullName,
    fatherOrSpouse: row.fatherOrSpouse ?? null,
    gender: row.gender ?? null,
    dateOfBirth: toDateOnly(row.dateOfBirth),
    phone: row.phone ?? null,
    photoFileId: row.photoFileId ?? null,
    idProofType: row.idProofType ?? null,
    idProofLast4: row.idProofLast4 ?? null,
    labourCategoryId: row.labourCategoryId,
    categoryName: categoryName ?? null,
    engagementType: row.engagementType,
    contractorId: row.contractorId ?? null,
    dailyWage: row.dailyWage?.toString?.() ?? null,
    bankAccountLast4: row.bankAccountLast4 ?? null,
    ifsc: row.ifsc ?? null,
    joiningDate: toDateOnly(row.joiningDate),
    exitDate: toDateOnly(row.exitDate),
    projectIds: row.projectIds ?? [],
    safetyInductionDone: !!row.safetyInductionDone,
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

async function categoryNameMap(orgId: string, ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (!unique.length) return new Map();
  const cats = await db.cnLabourCategory.findMany({
    where: { orgId, id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(cats.map((c) => [c.id, c.name]));
}

export interface ListWorkmenOptions {
  orgId: string;
  createdBy: string;
  search?: string;
  labourCategoryId?: string;
  contractorId?: string;
  engagementType?: string;
  projectId?: string;
  take?: number;
  skip?: number;
  status?: "active" | "inactive" | "all";
  orderBy?: Array<Record<string, "asc" | "desc">>;
}

function buildWhere(
  opts: Omit<ListWorkmenOptions, "createdBy" | "take" | "skip" | "orderBy">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    ...(opts.labourCategoryId ? { labourCategoryId: opts.labourCategoryId } : {}),
    ...(opts.contractorId ? { contractorId: opts.contractorId } : {}),
    ...(opts.engagementType ? { engagementType: opts.engagementType } : {}),
    ...(opts.projectId ? { projectIds: { has: opts.projectId } } : {}),
    ...(opts.status === "inactive"
      ? { status: "inactive" }
      : opts.status === "active"
        ? { status: { notIn: ["inactive", "deleted"] } }
        : { status: { not: "deleted" } }),
    ...(q
      ? {
          OR: [
            { workmanCode: { contains: q, mode: "insensitive" } },
            { fullName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listWorkmen(opts: ListWorkmenOptions): Promise<WorkmanRecord[]> {
  const rows = await db.cnWorkman.findMany({
    where: buildWhere(opts),
    orderBy: opts.orderBy ?? { workmanCode: "asc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  const names = await categoryNameMap(opts.orgId, rows.map((r) => r.labourCategoryId));
  return rows.map((r) => toRecord(r, names.get(r.labourCategoryId)));
}

export async function countWorkmen(
  opts: Omit<ListWorkmenOptions, "createdBy" | "take" | "skip" | "orderBy">,
): Promise<number> {
  return db.cnWorkman.count({ where: buildWhere(opts) });
}

export async function findWorkmanById(orgId: string, id: string): Promise<WorkmanRecord | null> {
  const row = await db.cnWorkman.findFirst({ where: { id, orgId } });
  if (!row) return null;
  const names = await categoryNameMap(orgId, [row.labourCategoryId]);
  return toRecord(row, names.get(row.labourCategoryId));
}

function normalizeEngagement(v: unknown): EngagementType {
  const s = String(v ?? "").trim().toUpperCase();
  if ((ENGAGEMENT_TYPES as readonly string[]).includes(s)) return s as EngagementType;
  throw new DomainError("VALIDATION", `engagementType must be one of ${ENGAGEMENT_TYPES.join(", ")}`, 400);
}

function last4(v: unknown, field: string): string | null {
  if (v == null || String(v).trim() === "") return null;
  const s = String(v).trim();
  if (s.length > 4) {
    throw new DomainError(
      "WORKMAN_PII_INVALID",
      `${field} must contain at most 4 characters — store only the last 4, never the full number`,
      400,
    );
  }
  return s;
}

function parseDate(v: unknown): Date | null {
  if (v == null || String(v).trim() === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function assertRefsValid(
  orgId: string,
  labourCategoryId: string,
  engagementType: EngagementType,
  contractorId: string | null,
): Promise<void> {
  const cat = await db.cnLabourCategory.findFirst({
    where: { id: labourCategoryId, orgId },
    select: { id: true },
  });
  if (!cat) throw new DomainError("VALIDATION", "labourCategoryId is invalid", 400);

  if (engagementType === "CONTRACTOR") {
    if (!contractorId) {
      throw new DomainError("WORKMAN_CONTRACTOR_MISMATCH", "Contractor workmen require a contractorId", 400);
    }
    const c = await db.cnContractor.findFirst({ where: { id: contractorId, orgId }, select: { id: true } });
    if (!c) throw new DomainError("VALIDATION", "contractorId is invalid", 400);
  } else if (contractorId) {
    throw new DomainError("WORKMAN_CONTRACTOR_MISMATCH", "Departmental workmen must not have a contractorId", 400);
  }
}

async function nextWorkmanCode(orgId: string): Promise<string> {
  const latest = await db.cnWorkman.findFirst({
    where: { orgId, workmanCode: { startsWith: "WM-" } },
    orderBy: { workmanCode: "desc" },
    select: { workmanCode: true },
  });
  const n = latest ? parseInt(latest.workmanCode.replace(/^WM-/, ""), 10) : 0;
  const next = (Number.isFinite(n) ? n : 0) + 1;
  return `WM-${String(next).padStart(4, "0")}`;
}

export interface CreateWorkmanInput {
  orgId: string;
  createdBy: string;
  fullName: string;
  labourCategoryId: string;
  engagementType: string;
  contractorId?: string | null;
  fatherOrSpouse?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  photoFileId?: string | null;
  idProofType?: string | null;
  idProofLast4?: string | null;
  dailyWage?: number | string | null;
  bankAccountLast4?: string | null;
  ifsc?: string | null;
  joiningDate?: string | null;
  exitDate?: string | null;
  projectIds?: string[];
  safetyInductionDone?: boolean;
  status?: string;
}

export async function createWorkman(input: CreateWorkmanInput): Promise<WorkmanRecord> {
  if (!String(input.fullName ?? "").trim()) {
    throw new DomainError("VALIDATION", "fullName is required", 400);
  }
  const engagementType = normalizeEngagement(input.engagementType);
  const contractorId = input.contractorId ? String(input.contractorId) : null;
  await assertRefsValid(input.orgId, input.labourCategoryId, engagementType, contractorId);

  const idProofLast4 = last4(input.idProofLast4, "idProofLast4");
  const bankAccountLast4 = last4(input.bankAccountLast4, "bankAccountLast4");

  const row = await withDocNumberRetry(
    () => nextWorkmanCode(input.orgId),
    (workmanCode: string) =>
      db.cnWorkman.create({
        data: {
          orgId: input.orgId,
          workmanCode,
          fullName: String(input.fullName).trim(),
          fatherOrSpouse: input.fatherOrSpouse ? String(input.fatherOrSpouse).trim() : null,
          gender: input.gender ? String(input.gender).trim().toUpperCase().slice(0, 1) : null,
          dateOfBirth: parseDate(input.dateOfBirth),
          phone: input.phone ? String(input.phone).trim() : null,
          photoFileId: input.photoFileId ? String(input.photoFileId) : null,
          idProofType: input.idProofType ? String(input.idProofType).trim() : null,
          idProofLast4,
          labourCategoryId: input.labourCategoryId,
          engagementType,
          contractorId,
          dailyWage: input.dailyWage != null && input.dailyWage !== "" ? new Prisma.Decimal(input.dailyWage) : null,
          bankAccountLast4,
          ifsc: input.ifsc ? String(input.ifsc).trim().toUpperCase() : null,
          joiningDate: parseDate(input.joiningDate),
          exitDate: parseDate(input.exitDate),
          projectIds: Array.isArray(input.projectIds) ? input.projectIds : [],
          safetyInductionDone: !!input.safetyInductionDone,
          status: input.status ?? "active",
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
        },
      }),
    "workmanCode",
  );
  return toRecord(row);
}

export interface UpdateWorkmanInput
  extends Partial<Omit<CreateWorkmanInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateWorkman(
  orgId: string,
  id: string,
  patch: UpdateWorkmanInput,
): Promise<WorkmanRecord | null> {
  const existing = await db.cnWorkman.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  const engagementType = patch.engagementType
    ? normalizeEngagement(patch.engagementType)
    : (existing.engagementType as EngagementType);
  const contractorId =
    patch.contractorId !== undefined
      ? patch.contractorId
        ? String(patch.contractorId)
        : null
      : existing.contractorId;
  const labourCategoryId = patch.labourCategoryId ?? existing.labourCategoryId;

  if (
    patch.engagementType !== undefined ||
    patch.contractorId !== undefined ||
    patch.labourCategoryId !== undefined
  ) {
    await assertRefsValid(orgId, labourCategoryId, engagementType, contractorId);
  }

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.fullName !== undefined) data.fullName = String(patch.fullName).trim();
  if (patch.fatherOrSpouse !== undefined)
    data.fatherOrSpouse = patch.fatherOrSpouse ? String(patch.fatherOrSpouse).trim() : null;
  if (patch.gender !== undefined)
    data.gender = patch.gender ? String(patch.gender).trim().toUpperCase().slice(0, 1) : null;
  if (patch.dateOfBirth !== undefined) data.dateOfBirth = parseDate(patch.dateOfBirth);
  if (patch.phone !== undefined) data.phone = patch.phone ? String(patch.phone).trim() : null;
  if (patch.photoFileId !== undefined)
    data.photoFileId = patch.photoFileId ? String(patch.photoFileId) : null;
  if (patch.idProofType !== undefined)
    data.idProofType = patch.idProofType ? String(patch.idProofType).trim() : null;
  if (patch.idProofLast4 !== undefined) data.idProofLast4 = last4(patch.idProofLast4, "idProofLast4");
  if (patch.labourCategoryId !== undefined) data.labourCategoryId = labourCategoryId;
  if (patch.engagementType !== undefined) data.engagementType = engagementType;
  if (patch.contractorId !== undefined) data.contractorId = contractorId;
  if (patch.dailyWage !== undefined)
    data.dailyWage = patch.dailyWage != null && patch.dailyWage !== "" ? new Prisma.Decimal(patch.dailyWage) : null;
  if (patch.bankAccountLast4 !== undefined)
    data.bankAccountLast4 = last4(patch.bankAccountLast4, "bankAccountLast4");
  if (patch.ifsc !== undefined) data.ifsc = patch.ifsc ? String(patch.ifsc).trim().toUpperCase() : null;
  if (patch.joiningDate !== undefined) data.joiningDate = parseDate(patch.joiningDate);
  if (patch.exitDate !== undefined) data.exitDate = parseDate(patch.exitDate);
  if (patch.projectIds !== undefined)
    data.projectIds = Array.isArray(patch.projectIds) ? patch.projectIds : [];
  if (patch.safetyInductionDone !== undefined)
    data.safetyInductionDone = !!patch.safetyInductionDone;
  if (patch.status !== undefined) data.status = patch.status;

  const row = await db.cnWorkman.update({ where: { id }, data });
  return toRecord(row);
}

export async function deleteWorkman(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await db.cnWorkman.updateMany({
    where: { id, orgId },
    data: { status: "deleted", updatedBy },
  });
  return res.count > 0;
}
