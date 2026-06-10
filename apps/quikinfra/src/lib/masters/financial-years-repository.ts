/**
 * Financial Years master — Prisma-backed CRUD for `cn_financial_years`.
 */

import { db } from "@/lib/db";

export interface FinancialYearRecord {
  id: string;
  orgId: string;
  companyId: string;
  companyName: string | null;
  label: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function toRecord(row: any): FinancialYearRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    companyId: row.companyId,
    companyName: row.company?.name ?? null,
    label: row.label,
    startDate: row.startDate ? row.startDate.toISOString().slice(0, 10) : "",
    endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : "",
    isCurrent: !!row.isCurrent,
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

async function resolveCompanyId(
  orgId: string,
  provided?: string | null,
): Promise<string> {
  if (provided && String(provided).trim()) return String(provided).trim();
  const company = await (db as any).cnCompany.findFirst({
    where: { orgId, status: "active" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!company) {
    throw new Error("No company exists yet. Please create a company before adding a financial year.");
  }
  return company.id;
}

export interface ListFinancialYearsOptions {
  orgId: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildFinancialYearsWhere(
  opts: Pick<ListFinancialYearsOptions, "orgId" | "search">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    ...(q ? { label: { contains: q, mode: "insensitive" } } : {}),
  };
}

export async function listFinancialYears(
  opts: ListFinancialYearsOptions,
): Promise<FinancialYearRecord[]> {
  const rows = await (db as any).cnFinancialYear.findMany({
    where: buildFinancialYearsWhere(opts),
    include: { company: true },
    orderBy: { startDate: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countFinancialYears(
  opts: Pick<ListFinancialYearsOptions, "orgId" | "search">,
): Promise<number> {
  return (db as any).cnFinancialYear.count({
    where: buildFinancialYearsWhere(opts),
  });
}

export async function findFinancialYearById(
  orgId: string,
  id: string,
): Promise<FinancialYearRecord | null> {
  const row = await (db as any).cnFinancialYear.findFirst({
    where: { id, orgId },
    include: { company: true },
  });
  return row ? toRecord(row) : null;
}

export interface CreateFinancialYearInput {
  orgId: string;
  createdBy: string;
  companyId?: string | null;
  label: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
  status?: string;
}

export async function createFinancialYear(
  input: CreateFinancialYearInput,
): Promise<FinancialYearRecord> {
  const companyId = await resolveCompanyId(input.orgId, input.companyId);

  if (input.isCurrent) {
    await (db as any).cnFinancialYear.updateMany({
      where: { orgId: input.orgId, isCurrent: true },
      data: { isCurrent: false, updatedBy: input.createdBy },
    });
  }

  const row = await (db as any).cnFinancialYear.create({
    data: {
      orgId: input.orgId,
      companyId,
      label: String(input.label).trim(),
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      isCurrent: !!input.isCurrent,
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
    include: { company: true },
  });
  return toRecord(row);
}

export interface UpdateFinancialYearInput
  extends Partial<Omit<CreateFinancialYearInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateFinancialYear(
  orgId: string,
  id: string,
  patch: UpdateFinancialYearInput,
): Promise<FinancialYearRecord | null> {
  const existing = await (db as any).cnFinancialYear.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  if (patch.isCurrent === true) {
    await (db as any).cnFinancialYear.updateMany({
      where: {
        orgId,
        isCurrent: true,
        NOT: { id },
      },
      data: { isCurrent: false, updatedBy: patch.updatedBy },
    });
  }

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.companyId !== undefined && patch.companyId) data.companyId = patch.companyId;
  if (patch.label !== undefined) data.label = String(patch.label).trim();
  if (patch.startDate !== undefined) data.startDate = new Date(patch.startDate);
  if (patch.endDate !== undefined) data.endDate = new Date(patch.endDate);
  if (patch.isCurrent !== undefined) data.isCurrent = !!patch.isCurrent;
  if (patch.status !== undefined) data.status = patch.status;

  const row = await (db as any).cnFinancialYear.update({
    where: { id },
    data,
    include: { company: true },
  });
  return toRecord(row);
}

export async function deleteFinancialYear(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await (db as any).cnFinancialYear.updateMany({
    where: { id, orgId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
