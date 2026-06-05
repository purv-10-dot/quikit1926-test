/**
 * Bank accounts master — Prisma-backed CRUD for `cn_banks`.
 *
 * `companyId` is a required FK on the schema. The list response also
 * denormalises `companyName` from the related CnCompany so the UI can
 * render it without a second query.
 */

import { db } from "@/lib/db";

export interface BankRecord {
  id: string;
  orgId: string;
  bankName: string;
  branchName: string | null;
  accountNo: string;
  ifscCode: string;
  accountType: string;
  companyId: string;
  companyName: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function toRecord(row: any): BankRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    bankName: row.bankName,
    branchName: row.branchName ?? null,
    accountNo: row.accountNo,
    ifscCode: row.ifscCode,
    accountType: row.accountType,
    companyId: row.companyId,
    companyName: row.company?.name ?? null,
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export interface ListBanksOptions {
  orgId: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildBanksWhere(
  opts: Pick<ListBanksOptions, "orgId" | "search">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    ...(q
      ? {
          OR: [
            { bankName: { contains: q, mode: "insensitive" } },
            { branchName: { contains: q, mode: "insensitive" } },
            { accountNo: { contains: q, mode: "insensitive" } },
            { ifscCode: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listBanks(opts: ListBanksOptions): Promise<BankRecord[]> {
  const rows = await (db as any).cnBank.findMany({
    where: buildBanksWhere(opts),
    include: { company: true },
    orderBy: { bankName: "asc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countBanks(
  opts: Pick<ListBanksOptions, "orgId" | "search">,
): Promise<number> {
  return (db as any).cnBank.count({ where: buildBanksWhere(opts) });
}

export async function findBankById(orgId: string, id: string): Promise<BankRecord | null> {
  const row = await (db as any).cnBank.findFirst({
    where: { id, orgId },
    include: { company: true },
  });
  return row ? toRecord(row) : null;
}

export interface CreateBankInput {
  orgId: string;
  createdBy: string;
  bankName: string;
  branchName?: string | null;
  accountNo: string;
  ifscCode: string;
  accountType: string;
  companyId: string;
  status?: string;
}

export async function createBank(input: CreateBankInput): Promise<BankRecord> {
  const row = await (db as any).cnBank.create({
    data: {
      orgId: input.orgId,
      bankName: String(input.bankName).trim(),
      branchName: input.branchName ? String(input.branchName).trim() : null,
      accountNo: String(input.accountNo).trim(),
      ifscCode: String(input.ifscCode).trim().toUpperCase(),
      accountType: String(input.accountType).trim().toLowerCase(),
      companyId: input.companyId,
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
    include: { company: true },
  });
  return toRecord(row);
}

export interface UpdateBankInput
  extends Partial<Omit<CreateBankInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateBank(
  orgId: string,
  id: string,
  patch: UpdateBankInput,
): Promise<BankRecord | null> {
  const existing = await (db as any).cnBank.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.bankName !== undefined) data.bankName = String(patch.bankName).trim();
  if (patch.branchName !== undefined)
    data.branchName = patch.branchName ? String(patch.branchName).trim() : null;
  if (patch.accountNo !== undefined) data.accountNo = String(patch.accountNo).trim();
  if (patch.ifscCode !== undefined) data.ifscCode = String(patch.ifscCode).trim().toUpperCase();
  if (patch.accountType !== undefined)
    data.accountType = String(patch.accountType).trim().toLowerCase();
  if (patch.companyId !== undefined) data.companyId = patch.companyId;
  if (patch.status !== undefined) data.status = patch.status;

  const row = await (db as any).cnBank.update({
    where: { id },
    data,
    include: { company: true },
  });
  return toRecord(row);
}

export async function deleteBank(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await (db as any).cnBank.updateMany({
    where: { id, orgId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
