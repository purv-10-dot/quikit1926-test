/**
 * Companies master — Prisma-backed CRUD for `cn_companies`.
 *
 * Mirrors vendors/contractors repositories: tenant-scoped, soft-delete
 * via `status = "inactive"`. No auto-seed — every tenant creates their
 * own legal entity through the UI. (An earlier version reseeded a demo
 * "Quik Infrastructure Pvt Ltd" row on every list call when the table
 * was empty, which made hard-deleted rows reappear on next page load
 * and confused real users.)
 *
 * Note: `cn_companies` requires `legalName/gstin/pan/address/city/state/
 * pincode` NOT NULL. The UI form only marks `name` as required. We insert
 * empty strings for absent values to preserve the form's flexibility
 * without relaxing the schema.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";

export interface CompanyRecord {
  id: string;
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

function toRecord(row: Prisma.CnCompanyGetPayload<Record<string, never>>): CompanyRecord {
  return {
    id: row.id,
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
  orgId: string;
  createdBy: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
  /** Server-side sort (from `parseSort`). Defaults to newest-first. */
  orderBy?: Array<Record<string, "asc" | "desc">>;
}

function buildCompaniesWhere(opts: Pick<ListCompaniesOptions, "orgId" | "search">): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
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
  const rows = await db.cnCompany.findMany({
    where: buildCompaniesWhere(opts),
    orderBy: opts.orderBy ?? { createdAt: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countCompanies(opts: Pick<ListCompaniesOptions, "orgId" | "search">): Promise<number> {
  return db.cnCompany.count({ where: buildCompaniesWhere(opts) });
}

export async function findCompanyById(orgId: string, id: string): Promise<CompanyRecord | null> {
  const row = await db.cnCompany.findFirst({ where: { id, orgId } });
  return row ? toRecord(row) : null;
}

/**
 * The org's own legal entity — used as the buyer / "bill-to" on outgoing
 * PO documents (name, GSTIN, billing address). Prefers an active company,
 * else the earliest one. Returns null if the org hasn't set one up, so
 * callers can render a blank instead of a hardcoded placeholder.
 */
export async function getPrimaryCompany(orgId: string): Promise<CompanyRecord | null> {
  const row =
    (await db.cnCompany.findFirst({
      where: { orgId, status: "active" },
      orderBy: { createdAt: "asc" },
    })) ??
    (await db.cnCompany.findFirst({
      where: { orgId },
      orderBy: { createdAt: "asc" },
    }));
  return row ? toRecord(row) : null;
}

/** Join a company's address parts into a single billing-address line. */
export function companyBillingAddress(c: CompanyRecord | null): string | null {
  if (!c) return null;
  const parts = [c.address, c.city, c.state, c.pincode].filter(
    (x) => x && String(x).trim(),
  );
  const joined = parts.join(", ");
  return joined || null;
}

export interface CreateCompanyInput {
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
  const row = await db.cnCompany.create({
    data: {
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
  extends Partial<Omit<CreateCompanyInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateCompany(
  orgId: string,
  id: string,
  patch: UpdateCompanyInput,
): Promise<CompanyRecord | null> {
  const existing = await db.cnCompany.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  const requiredText: Array<keyof UpdateCompanyInput> = [
    "name", "legalName", "address", "city", "state", "pincode",
  ];
  for (const k of requiredText) {
    if (patch[k] !== undefined) data[k] = s(patch[k]);
  }
  const optional: Array<keyof UpdateCompanyInput> = [
    "shortName", "phone", "email", "website", "logoUrl",
    "bankName", "branchName", "accountNo", "accountType",
  ];
  for (const k of optional) {
    if (patch[k] !== undefined) data[k] = sOrNull(patch[k]);
  }
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

  const row = await db.cnCompany.update({ where: { id }, data });
  return toRecord(row);
}

export async function deleteCompany(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await db.cnCompany.updateMany({
    where: { id, orgId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
