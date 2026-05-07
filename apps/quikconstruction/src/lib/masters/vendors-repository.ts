/**
 * Vendors master — Prisma-backed CRUD for `vendors`.
 *
 * Preserves the existing API's rich shape (person `name` + separate
 * `companyName`, `vendorType`, `paymentTerms` as a string etc.) by
 * mapping directly to the extended `CnVendor` schema.
 *
 * Schema-drift tolerant: columns defined in `schema.prisma` that the
 * compiled Prisma client or the live DB don't know about (e.g. when
 * `prisma db push` hasn't run since a field was added) are stripped
 * and the save retried — keeps the app functional until the push.
 */

import { db } from "@/lib/db/prisma";

export interface VendorRecord {
  id: string;
  tenantId: string;
  orgId: string;
  code: string;
  name: string;
  companyName: string;
  legalName: string | null;
  vendorType: string;
  category: string;
  contactPerson: string;
  phone: string;
  email: string;
  gstin: string;
  gstType: string;
  pan: string;
  msmeStatus: string;
  msmeNumber: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  bankName: string;
  bankAccountNo: string;
  bankIfsc: string;
  paymentTerms: string;
  paymentTermsDays: string;
  blacklistReason: string;
  rating: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function toRecord(row: any): VendorRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    orgId: row.orgId,
    code: row.code,
    name: row.name ?? "",
    companyName: row.companyName ?? row.legalName ?? row.name ?? "",
    legalName: row.legalName ?? null,
    vendorType: row.vendorType ?? "Supplier",
    category: row.category ?? "",
    contactPerson: row.contactPerson ?? row.name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    gstin: row.gstin ?? "",
    gstType: row.gstType ?? "Regular",
    pan: row.pan ?? "",
    msmeStatus: row.msmeStatus ?? "Unregistered",
    msmeNumber: row.msmeNumber ?? "",
    address: row.address ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    pincode: row.pincode ?? "",
    bankName: row.bankName ?? "",
    bankAccountNo: row.bankAccountNo ?? "",
    bankIfsc: row.bankIfsc ?? "",
    paymentTerms: row.paymentTerms ?? "Net 30",
    paymentTermsDays:
      row.paymentTermsDays !== undefined && row.paymentTermsDays !== null
        ? String(row.paymentTermsDays)
        : "30",
    blacklistReason: row.blacklistReason ?? "",
    rating: row.rating ?? null,
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

// ─── Schema-drift strip-and-retry (mirrors other repositories) ─────

const STRIPPABLE_FIELDS = new Set([
  "companyName",
  "vendorType",
  "category",
  "gstType",
  "msmeStatus",
  "msmeNumber",
  "paymentTerms",
  "blacklistReason",
]);
const loggedMissing = new Set<string>();

function warnOnceMissing(field: string) {
  if (loggedMissing.has(field)) return;
  loggedMissing.add(field);
  console.warn(
    `[vendors-repository] Prisma field \`${field}\` missing — run ` +
      `\`npx prisma db push && npx prisma generate\`. Saving other fields only.`,
  );
}
function extractUnknownArgument(message: string): string | null {
  const m = message.match(/Unknown argument `([^`]+)`/);
  return m?.[1] ?? null;
}
function stripFieldDeep(obj: any, field: string): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((x) => stripFieldDeep(x, field));
  if (typeof obj === "object" && Object.getPrototypeOf(obj) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === field) continue;
      out[k] = stripFieldDeep(v, field);
    }
    return out;
  }
  return obj;
}
async function withSchemaDriftRetry<T>(
  buildPayload: () => Record<string, unknown>,
  run: (payload: any) => Promise<T>,
): Promise<T> {
  let payload = buildPayload();
  for (let i = 0; i < 10; i++) {
    try {
      return await run(payload);
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      let bad: string | null = null;
      if (msg.includes("Unknown argument")) bad = extractUnknownArgument(msg);
      else if (err?.code === "P2022") bad = String(err?.meta?.column ?? "") || null;
      if (!bad) throw err;
      // P2022 returns `table.column`; strip table prefix so the
      // STRIPPABLE_FIELDS set (bare names) can match.
      const bareBad = bad.includes(".") ? bad.split(".").pop()! : bad;
      if (!STRIPPABLE_FIELDS.has(bareBad)) throw err;
      warnOnceMissing(bareBad);
      payload = stripFieldDeep(payload, bareBad);
    }
  }
  return await run(payload);
}

// ─── Public API ────────────────────────────────────────────────────

export interface ListVendorsOptions {
  tenantId: string;
  orgId: string;
  createdBy: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildVendorsWhere(
  opts: Pick<ListVendorsOptions, "tenantId" | "orgId" | "search">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    tenantId: opts.tenantId,
    orgId: opts.orgId,
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { companyName: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { gstin: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listVendors(opts: ListVendorsOptions): Promise<VendorRecord[]> {
  const rows = await (db as any).cnVendor.findMany({
    where: buildVendorsWhere(opts),
    orderBy: { createdAt: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countVendors(
  opts: Pick<ListVendorsOptions, "tenantId" | "orgId" | "search">,
): Promise<number> {
  return (db as any).cnVendor.count({ where: buildVendorsWhere(opts) });
}

export async function findVendorById(
  tenantId: string,
  id: string,
): Promise<VendorRecord | null> {
  const row = await (db as any).cnVendor.findFirst({
    where: { id, tenantId },
  });
  return row ? toRecord(row) : null;
}

/**
 * Per-PO/Indent gate. A vendor is blacklisted when their `status` column
 * is `"blacklisted"`. Returns `false` for missing vendors so callers
 * surface the standard "vendor not found" error path instead of a
 * misleading blacklist error.
 */
export async function isVendorBlacklisted(
  tenantId: string,
  vendorId: string,
): Promise<boolean> {
  if (!vendorId) return false;
  const row = await (db as any).cnVendor.findFirst({
    where: { id: vendorId, tenantId },
    select: { status: true },
  });
  return row?.status === "blacklisted";
}

/** Batch-fetch — used by Indent / RFQ / PO repositories for enrichment. */
export async function findVendorsByIds(
  tenantId: string,
  ids: string[],
): Promise<Map<string, VendorRecord>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const rows = await (db as any).cnVendor.findMany({
    where: { tenantId, id: { in: unique } },
  });
  const map = new Map<string, VendorRecord>();
  for (const r of rows) map.set(r.id, toRecord(r));
  return map;
}

export interface CreateVendorInput {
  tenantId: string;
  orgId: string;
  createdBy: string;
  code?: string;
  name: string;
  companyName?: string;
  vendorType?: string;
  category?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  gstType?: string;
  pan?: string;
  msmeStatus?: string;
  msmeNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  paymentTerms?: string;
  paymentTermsDays?: string | number;
  blacklistReason?: string;
  status?: string;
}

function autoCode(existingCount: number): string {
  return `VND-${String(existingCount + 1).padStart(3, "0")}`;
}

export async function createVendor(input: CreateVendorInput): Promise<VendorRecord> {
  // Derive a code if the caller didn't supply one. Matches the legacy
  // in-memory generator: `VND-{seq}` padded to three digits.
  let code = (input.code ?? "").trim();
  if (!code) {
    const existingCount = await (db as any).cnVendor.count({
      where: { tenantId: input.tenantId, orgId: input.orgId },
    });
    code = autoCode(existingCount);
  }

  const row = await withSchemaDriftRetry(
    () => ({
      tenantId: input.tenantId,
      orgId: input.orgId,
      code,
      name: input.name,
      companyName: input.companyName ?? null,
      vendorType: input.vendorType ?? "Supplier",
      category: input.category?.trim() || null,
      contactPerson: input.contactPerson ?? input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      gstin: input.gstin ? String(input.gstin).toUpperCase() : null,
      gstType: input.gstType ?? "Regular",
      pan: input.pan ? String(input.pan).toUpperCase() : null,
      msmeStatus: input.msmeStatus ?? "Unregistered",
      msmeNumber: input.msmeNumber ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      pincode: input.pincode ?? null,
      bankName: input.bankName ?? null,
      bankAccountNo: input.bankAccountNo ?? null,
      bankIfsc: input.bankIfsc
        ? String(input.bankIfsc).toUpperCase()
        : null,
      paymentTerms: input.paymentTerms ?? "Net 30",
      paymentTermsDays:
        input.paymentTermsDays !== undefined && input.paymentTermsDays !== null
          ? parseInt(String(input.paymentTermsDays), 10) || null
          : null,
      blacklistReason: input.blacklistReason ?? null,
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    }),
    (data) => (db as any).cnVendor.create({ data }),
  );
  return toRecord(row);
}

export interface UpdateVendorInput
  extends Partial<Omit<CreateVendorInput, "tenantId" | "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateVendor(
  tenantId: string,
  id: string,
  patch: UpdateVendorInput,
): Promise<VendorRecord | null> {
  const existing = await (db as any).cnVendor.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  if (!existing) return null;

  const row = await withSchemaDriftRetry(
    () => {
      const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
      const passthrough: Array<keyof UpdateVendorInput> = [
        "code", "name", "companyName", "vendorType", "category", "contactPerson",
        "phone", "email", "msmeStatus", "msmeNumber",
        "address", "city", "state", "pincode",
        "bankName", "bankAccountNo", "paymentTerms",
        "blacklistReason", "status", "gstType",
      ];
      for (const k of passthrough) {
        if (patch[k] !== undefined) data[k] = patch[k];
      }
      if (patch.gstin !== undefined) data.gstin = patch.gstin ? String(patch.gstin).toUpperCase() : null;
      if (patch.pan !== undefined) data.pan = patch.pan ? String(patch.pan).toUpperCase() : null;
      if (patch.bankIfsc !== undefined)
        data.bankIfsc = patch.bankIfsc ? String(patch.bankIfsc).toUpperCase() : null;
      if (patch.paymentTermsDays !== undefined) {
        data.paymentTermsDays = patch.paymentTermsDays
          ? parseInt(String(patch.paymentTermsDays), 10) || null
          : null;
      }
      return data;
    },
    (data) => (db as any).cnVendor.update({ where: { id }, data }),
  );
  return toRecord(row);
}

export async function deleteVendor(
  tenantId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  // Soft delete — set status to `inactive`. PO/GRN foreign keys still
  // resolve; the master UI hides the row from normal queries.
  const res = await (db as any).cnVendor.updateMany({
    where: { id, tenantId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
