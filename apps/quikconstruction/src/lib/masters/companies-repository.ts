/**
 * Companies master — Prisma-backed CRUD for `companies`.
 *
 * Mirrors vendors/contractors repositories: tenant-scoped, soft-delete
 * via `status = "inactive"`. No auto-seed — every tenant creates their
 * own legal entity through the UI. (An earlier version reseeded a demo
 * "Quik Infrastructure Pvt Ltd" row on every list call when the table
 * was empty, which made hard-deleted rows reappear on next page load
 * and confused real users.)
 *
 * Note: `companies` requires `legalName/gstin/pan/address/city/state/
 * pincode` NOT NULL. The UI form only marks `name` as required. We insert
 * empty strings for absent values to preserve the form's flexibility
 * without relaxing the schema.
 */

import { db } from "@/lib/db/prisma";

export interface CompanyRecord {
  id: string;
  tenantId: string;
  orgId: string;
  name: string;
  legalName: string;
  shortName: string | null;
  gstin: string;
  pan: string;
  cin: string | null;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
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

function toRecord(row: any): CompanyRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    orgId: row.orgId,
    name: row.name ?? "",
    legalName: row.legalName ?? "",
    shortName: row.shortName ?? null,
    gstin: row.gstin ?? "",
    pan: row.pan ?? "",
    cin: row.cin ?? null,
    address: row.address ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    pincode: row.pincode ?? "",
    phone: row.phone ?? null,
    email: row.email ?? null,
    website: row.website ?? null,
    logoUrl: row.logoUrl ?? null,
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

export interface ListCompaniesOptions {
  tenantId: string;
  orgId: string;
  createdBy: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

// Shared where-clause builder so list + count stay in sync. Extracted
// once so the SQL filter is identical between the page query and the
// count query — divergence would make `total` lie about hasMore.
function buildCompaniesWhere(opts: Pick<ListCompaniesOptions, "tenantId" | "orgId" | "search">): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    tenantId: opts.tenantId,
    orgId: opts.orgId,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { legalName: { contains: q, mode: "insensitive" } },
            { gstin: { contains: q, mode: "insensitive" } },
            { pan: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listCompanies(opts: ListCompaniesOptions): Promise<CompanyRecord[]> {
  const rows = await (db as any).cnCompany.findMany({
    where: buildCompaniesWhere(opts),
    orderBy: { createdAt: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

/**
 * Count rows matching the same filter `listCompanies` would return.
 * Pair with `listCompanies` for paginated routes:
 *
 *   const [data, total] = await Promise.all([
 *     listCompanies({ ...opts, take, skip }),
 *     countCompanies(opts),
 *   ]);
 */
export async function countCompanies(opts: Pick<ListCompaniesOptions, "tenantId" | "orgId" | "search">): Promise<number> {
  return (db as any).cnCompany.count({ where: buildCompaniesWhere(opts) });
}

export async function findCompanyById(tenantId: string, id: string): Promise<CompanyRecord | null> {
  const row = await (db as any).cnCompany.findFirst({ where: { id, tenantId } });
  return row ? toRecord(row) : null;
}

export interface CreateCompanyInput {
  tenantId: string;
  orgId: string;
  createdBy: string;
  name: string;
  legalName?: string | null;
  shortName?: string | null;
  gstin?: string | null;
  pan?: string | null;
  cin?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  accountNo?: string | null;
  ifscCode?: string | null;
  accountType?: string | null;
  status?: string;
}

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}
function sOrNull(v: unknown): string | null {
  const out = s(v);
  return out.length ? out : null;
}

export async function createCompany(input: CreateCompanyInput): Promise<CompanyRecord> {
  const row = await (db as any).cnCompany.create({
    data: {
      tenantId: input.tenantId,
      orgId: input.orgId,
      name: s(input.name),
      legalName: s(input.legalName),
      shortName: sOrNull(input.shortName),
      gstin: input.gstin ? String(input.gstin).toUpperCase().trim() : "",
      pan: input.pan ? String(input.pan).toUpperCase().trim() : "",
      cin: input.cin ? String(input.cin).toUpperCase().trim() : null,
      address: s(input.address),
      city: s(input.city),
      state: s(input.state),
      pincode: s(input.pincode),
      phone: sOrNull(input.phone),
      email: sOrNull(input.email),
      website: sOrNull(input.website),
      logoUrl: sOrNull(input.logoUrl),
      bankName: sOrNull(input.bankName),
      branchName: sOrNull(input.branchName),
      accountNo: sOrNull(input.accountNo),
      ifscCode: input.ifscCode ? String(input.ifscCode).toUpperCase().trim() : null,
      accountType: sOrNull(input.accountType),
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
  return toRecord(row);
}

export interface UpdateCompanyInput
  extends Partial<Omit<CreateCompanyInput, "tenantId" | "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateCompany(
  tenantId: string,
  id: string,
  patch: UpdateCompanyInput,
): Promise<CompanyRecord | null> {
  const existing = await (db as any).cnCompany.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  // Required (NOT NULL) text columns — fall back to empty string if blanked.
  const requiredText: Array<keyof UpdateCompanyInput> = [
    "name", "legalName", "address", "city", "state", "pincode",
  ];
  for (const k of requiredText) {
    if (patch[k] !== undefined) data[k] = s(patch[k]);
  }
  // Optional columns.
  const optional: Array<keyof UpdateCompanyInput> = [
    "shortName", "phone", "email", "website", "logoUrl",
    "bankName", "branchName", "accountNo", "accountType",
  ];
  for (const k of optional) {
    if (patch[k] !== undefined) data[k] = sOrNull(patch[k]);
  }
  // Uppercased codes.
  if (patch.gstin !== undefined) {
    data.gstin = patch.gstin ? String(patch.gstin).toUpperCase().trim() : "";
  }
  if (patch.pan !== undefined) {
    data.pan = patch.pan ? String(patch.pan).toUpperCase().trim() : "";
  }
  if (patch.cin !== undefined) {
    data.cin = patch.cin ? String(patch.cin).toUpperCase().trim() : null;
  }
  if (patch.ifscCode !== undefined) {
    data.ifscCode = patch.ifscCode ? String(patch.ifscCode).toUpperCase().trim() : null;
  }
  if (patch.status !== undefined) data.status = patch.status;

  const row = await (db as any).cnCompany.update({ where: { id }, data });
  return toRecord(row);
}

export async function deleteCompany(
  tenantId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await (db as any).cnCompany.updateMany({
    where: { id, tenantId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
