/**
 * Contractors master — Prisma-backed CRUD for `cn_contractors`.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";

export interface ContractorRecord {
  id: string;
  orgId: string;
  code: string;
  name: string;
  legalName: string | null;
  gstin: string | null;
  pan: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  licenseNo: string | null;
  specialization: string | null;
  bankName: string | null;
  branchName: string | null;
  accountNo: string | null;
  ifscCode: string | null;
  accountType: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function toRecord(row: Prisma.CnContractorGetPayload<Record<string, never>>): ContractorRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    code: row.code,
    name: row.name ?? "",
    legalName: row.legalName ?? null,
    gstin: row.gstin ?? null,
    pan: row.pan ?? null,
    contactPerson: row.contactPerson ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    licenseNo: row.licenseNo ?? null,
    specialization: row.specialization ?? null,
    bankName: row.bankName ?? null,
    branchName: row.branchName ?? null,
    accountNo: row.accountNo ?? null,
    ifscCode: row.ifscCode ?? null,
    accountType: row.accountType ?? null,
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export interface ListContractorsOptions {
  orgId: string;
  createdBy: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildContractorsWhere(
  opts: Pick<ListContractorsOptions, "orgId" | "search">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { contactPerson: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { gstin: { contains: q, mode: "insensitive" } },
            { specialization: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listContractors(
  opts: ListContractorsOptions,
): Promise<ContractorRecord[]> {
  const rows = await db.cnContractor.findMany({
    where: buildContractorsWhere(opts),
    orderBy: { createdAt: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countContractors(
  opts: Pick<ListContractorsOptions, "orgId" | "search">,
): Promise<number> {
  return db.cnContractor.count({ where: buildContractorsWhere(opts) });
}

export async function findContractorById(
  orgId: string,
  id: string,
): Promise<ContractorRecord | null> {
  const row = await db.cnContractor.findFirst({
    where: { id, orgId },
  });
  return row ? toRecord(row) : null;
}

export interface CreateContractorInput {
  orgId: string;
  createdBy: string;
  code?: string;
  name: string;
  legalName?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  pan?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  licenseNo?: string | null;
  specialization?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  accountNo?: string | null;
  ifscCode?: string | null;
  accountType?: string | null;
  status?: string;
}

function autoCode(existingCount: number): string {
  return `CON-${String(existingCount + 1).padStart(3, "0")}`;
}

function blankToNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export async function createContractor(
  input: CreateContractorInput,
): Promise<ContractorRecord> {
  let code = (input.code ?? "").trim();
  if (!code) {
    const existingCount = await db.cnContractor.count({
      where: { orgId: input.orgId },
    });
    code = autoCode(existingCount);
  }

  const row = await db.cnContractor.create({
    data: {
      orgId: input.orgId,
      code,
      name: String(input.name).trim(),
      legalName: blankToNull(input.legalName),
      contactPerson: blankToNull(input.contactPerson),
      phone: blankToNull(input.phone),
      email: blankToNull(input.email),
      gstin: input.gstin ? String(input.gstin).toUpperCase() : null,
      pan: input.pan ? String(input.pan).toUpperCase() : null,
      address: blankToNull(input.address),
      city: blankToNull(input.city),
      state: blankToNull(input.state),
      licenseNo: blankToNull(input.licenseNo),
      specialization: blankToNull(input.specialization),
      bankName: blankToNull(input.bankName),
      branchName: blankToNull(input.branchName),
      accountNo: blankToNull(input.accountNo),
      ifscCode: input.ifscCode ? String(input.ifscCode).toUpperCase() : null,
      accountType: blankToNull(input.accountType),
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
  return toRecord(row);
}

export interface UpdateContractorInput
  extends Partial<Omit<CreateContractorInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateContractor(
  orgId: string,
  id: string,
  patch: UpdateContractorInput,
): Promise<ContractorRecord | null> {
  const existing = await db.cnContractor.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  const passthrough: Array<keyof UpdateContractorInput> = [
    "code", "name", "legalName", "contactPerson", "phone", "email",
    "address", "city", "state", "licenseNo", "specialization",
    "bankName", "branchName", "accountNo", "accountType", "status",
  ];
  for (const k of passthrough) {
    if (patch[k] !== undefined) {
      data[k] =
        k === "name"
          ? String(patch[k]).trim()
          : blankToNull(patch[k] as string | null | undefined);
    }
  }
  if (patch.gstin !== undefined) {
    data.gstin = patch.gstin ? String(patch.gstin).toUpperCase() : null;
  }
  if (patch.pan !== undefined) {
    data.pan = patch.pan ? String(patch.pan).toUpperCase() : null;
  }
  if (patch.ifscCode !== undefined) {
    data.ifscCode = patch.ifscCode ? String(patch.ifscCode).toUpperCase() : null;
  }

  const row = await db.cnContractor.update({
    where: { id },
    data,
  });
  return toRecord(row);
}

export async function deleteContractor(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await db.cnContractor.updateMany({
    where: { id, orgId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
