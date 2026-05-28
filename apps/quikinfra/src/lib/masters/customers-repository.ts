/**
 * Customers master — Prisma-backed CRUD for `cn_customers`.
 * Auto-generates a CUS-### code when the caller doesn't supply one.
 */

import { db } from "@/lib/db/prisma";

export interface CustomerRecord {
  id: string;
  orgId: string;
  code: string;
  name: string;
  customerType: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gstin: string | null;
  pan: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  bankName: string | null;
  accountNumber: string | null;
  ifscCode: string | null;
  paymentTerms: string | null;
  creditLimit: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof (v as any)?.toString === "function") return (v as any).toString();
  return String(v);
}

function toRecord(row: any): CustomerRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    code: row.code,
    name: row.name,
    customerType: row.customerType ?? null,
    contactPerson: row.contactPerson ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    pincode: row.pincode ?? null,
    gstin: row.gstin ?? null,
    pan: row.pan ?? null,
    billingAddress: row.billingAddress ?? null,
    shippingAddress: row.shippingAddress ?? null,
    bankName: row.bankName ?? null,
    accountNumber: row.accountNumber ?? null,
    ifscCode: row.ifscCode ?? null,
    paymentTerms: row.paymentTerms ?? null,
    creditLimit:
      row.creditLimit === null || row.creditLimit === undefined ? null : toStr(row.creditLimit),
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function sOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}
function numOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
}

function autoCode(seq: number): string {
  return `CUS-${String(seq).padStart(3, "0")}`;
}

export interface ListOptions {
  orgId: string;
  createdBy: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildCustomersWhere(
  opts: Pick<ListOptions, "orgId" | "search">,
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
          ],
        }
      : {}),
  };
}

export async function listCustomers(opts: ListOptions): Promise<CustomerRecord[]> {
  const rows = await (db as any).cnCustomer.findMany({
    where: buildCustomersWhere(opts),
    orderBy: { createdAt: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countCustomers(
  opts: Pick<ListOptions, "orgId" | "search">,
): Promise<number> {
  return (db as any).cnCustomer.count({ where: buildCustomersWhere(opts) });
}

export async function findCustomerById(orgId: string, id: string): Promise<CustomerRecord | null> {
  const row = await (db as any).cnCustomer.findFirst({ where: { id, orgId } });
  return row ? toRecord(row) : null;
}

export interface CreateCustomerInput {
  orgId: string;
  createdBy: string;
  code?: string;
  name: string;
  customerType?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  gstin?: string | null;
  pan?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  paymentTerms?: string | null;
  creditLimit?: number | string | null;
  status?: string;
}

export async function createCustomer(input: CreateCustomerInput): Promise<CustomerRecord> {
  let code = (input.code ?? "").trim();
  if (!code) {
    const count = await (db as any).cnCustomer.count({
      where: { orgId: input.orgId },
    });
    code = autoCode(count + 1);
  }
  const row = await (db as any).cnCustomer.create({
    data: {
      orgId: input.orgId,
      code,
      name: String(input.name).trim(),
      customerType: sOrNull(input.customerType),
      contactPerson: sOrNull(input.contactPerson),
      phone: sOrNull(input.phone),
      email: sOrNull(input.email),
      address: sOrNull(input.address),
      city: sOrNull(input.city),
      state: sOrNull(input.state),
      pincode: sOrNull(input.pincode),
      gstin: input.gstin ? String(input.gstin).toUpperCase().trim() : null,
      pan: input.pan ? String(input.pan).toUpperCase().trim() : null,
      billingAddress: sOrNull(input.billingAddress),
      shippingAddress: sOrNull(input.shippingAddress),
      bankName: sOrNull(input.bankName),
      accountNumber: sOrNull(input.accountNumber),
      ifscCode: input.ifscCode ? String(input.ifscCode).toUpperCase().trim() : null,
      paymentTerms: sOrNull(input.paymentTerms),
      creditLimit: numOrNull(input.creditLimit),
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
  return toRecord(row);
}

export interface UpdateCustomerInput
  extends Partial<Omit<CreateCustomerInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateCustomer(
  orgId: string,
  id: string,
  patch: UpdateCustomerInput,
): Promise<CustomerRecord | null> {
  const existing = await (db as any).cnCustomer.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  const strFields: Array<keyof UpdateCustomerInput> = [
    "customerType", "contactPerson", "phone", "email",
    "address", "city", "state", "pincode",
    "billingAddress", "shippingAddress",
    "bankName", "accountNumber", "paymentTerms",
  ];
  for (const k of strFields) {
    if (patch[k] !== undefined) data[k] = sOrNull(patch[k]);
  }
  if (patch.code !== undefined) data.code = String(patch.code).trim();
  if (patch.name !== undefined) data.name = String(patch.name).trim();
  if (patch.gstin !== undefined) {
    data.gstin = patch.gstin ? String(patch.gstin).toUpperCase().trim() : null;
  }
  if (patch.pan !== undefined) {
    data.pan = patch.pan ? String(patch.pan).toUpperCase().trim() : null;
  }
  if (patch.ifscCode !== undefined) {
    data.ifscCode = patch.ifscCode ? String(patch.ifscCode).toUpperCase().trim() : null;
  }
  if (patch.creditLimit !== undefined) data.creditLimit = numOrNull(patch.creditLimit);
  if (patch.status !== undefined) data.status = patch.status;

  const row = await (db as any).cnCustomer.update({ where: { id }, data });
  return toRecord(row);
}

export async function deleteCustomer(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await (db as any).cnCustomer.updateMany({
    where: { id, orgId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
