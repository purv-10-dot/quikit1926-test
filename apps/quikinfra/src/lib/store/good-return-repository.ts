/**
 * Good Return repository — Postgres-backed CRUD for `cn_good_returns`.
 */

import { db } from "@/lib/db/prisma";

export interface GoodReturnLine {
  itemId?: string | null;
  itemName?: string | null;
  uomCode?: string | null;
  quantity?: number | string | null;
  returnQty?: number | string | null;
  unitRate?: number | string | null;
  amount?: number | string | null;
  reason?: string | null;
  remarks?: string | null;
}

export interface CreateGoodReturnInput {
  orgId: string;
  createdBy: string;
  returnNumber: string;
  projectId?: string | null;
  projectName?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  vendorId?: string | null;
  vendorName?: string | null;
  grnId?: string | null;
  grnNumber?: string | null;
  returnDate: Date;
  reason?: string | null;
  remarks?: string | null;
  vehicleNo?: string | null;
  driverName?: string | null;
  driverMobileNo?: string | null;
  challanNo?: string | null;
  transactionAmount?: number | string | null;
  intercityTransfer?: boolean;
  ewayBillNo?: string | null;
  photoAttachment?: string | null;
  lines?: GoodReturnLine[];
  status?: string;
}

export interface UpdateGoodReturnInput {
  orgId: string;
  updatedBy: string;
  projectName?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  vendorName?: string | null;
  grnNumber?: string | null;
  returnDate?: Date | null;
  reason?: string | null;
  remarks?: string | null;
  vehicleNo?: string | null;
  driverName?: string | null;
  driverMobileNo?: string | null;
  challanNo?: string | null;
  transactionAmount?: number | string | null;
  intercityTransfer?: boolean;
  ewayBillNo?: string | null;
  photoAttachment?: string | null;
  lines?: GoodReturnLine[] | null;
  status?: string;
}

function genId(): string {
  if (typeof (globalThis as any).crypto?.randomUUID === "function") {
    return (globalThis as any).crypto.randomUUID();
  }
  return `gr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toIsoDate(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  if (v?.toISOString) return v.toISOString().slice(0, 10);
  return null;
}

function mapRow(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    returnNumber: row.returnNumber,
    projectId: row.projectId ?? null,
    projectName: row.projectName ?? null,
    locationId: row.locationId ?? null,
    locationName: row.locationName ?? null,
    vendorId: row.vendorId ?? null,
    vendorName: row.vendorName ?? null,
    grnId: row.grnId ?? null,
    grnNumber: row.grnNumber ?? null,
    returnDate: toIsoDate(row.returnDate),
    reason: row.reason ?? null,
    remarks: row.remarks ?? null,
    vehicleNo: row.vehicleNo ?? null,
    driverName: row.driverName ?? null,
    driverMobileNo: row.driverMobileNo ?? null,
    challanNo: row.challanNo ?? null,
    transactionAmount: row.transactionAmount ?? null,
    intercityTransfer: row.intercityTransfer === true,
    ewayBillNo: row.ewayBillNo ?? null,
    photoAttachment: row.photoAttachment ?? null,
    lineCount: row.lineCount ?? 0,
    lines: Array.isArray(row.materials) ? row.materials : [],
    status: row.status ?? "draft",
    approvalId: row.approvalId ?? null,
    rejectionReason: row.rejectionReason ?? null,
    returnReason: row.returnReason ?? null,
    submittedAt: row.submittedAt?.toISOString?.() ?? row.submittedAt ?? null,
    submittedBy: row.submittedBy ?? null,
    approvedAt: row.approvedAt?.toISOString?.() ?? row.approvedAt ?? null,
    approvedBy: row.approvedBy ?? null,
    rejectedAt: row.rejectedAt?.toISOString?.() ?? row.rejectedAt ?? null,
    rejectedBy: row.rejectedBy ?? null,
    returnedAt: row.returnedAt?.toISOString?.() ?? row.returnedAt ?? null,
    returnedBy: row.returnedBy ?? null,
    dispatchedAt: row.dispatchedAt?.toISOString?.() ?? row.dispatchedAt ?? null,
    dispatchedBy: row.dispatchedBy ?? null,
    dispatchVehicleNo: row.dispatchVehicleNo ?? null,
    dispatchRemarks: row.dispatchRemarks ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt ?? null,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
  };
}

export async function listGoodReturns(
  orgId: string,
  opts: {
    status?: string | null;
    projectId?: string | null;
    search?: string | null;
    allowedProjectIds?: string[] | null;
  } = {},
): Promise<any[]> {
  const allowed = opts.allowedProjectIds ?? null;
  if (allowed !== null && allowed.length === 0) return [];

  const rows: any[] = await (db as any).$queryRaw`
    SELECT *
    FROM app_quikinfra."Good_returns"
    WHERE "orgId" = ${orgId}
    ORDER BY "returnDate" DESC NULLS LAST, "createdAt" DESC
  `;
  let mapped = rows.map(mapRow);

  if (allowed !== null) {
    const set = new Set(allowed);
    mapped = mapped.filter(
      (r: any) => !r.projectId || set.has(r.projectId),
    );
  }
  if (opts.status && opts.status !== "all") {
    mapped = mapped.filter(
      (r: any) => String(r.status ?? "").toLowerCase() === opts.status,
    );
  }
  if (opts.projectId) {
    mapped = mapped.filter((r: any) => r.projectId === opts.projectId);
  }
  if (opts.search) {
    const q = opts.search.toLowerCase();
    mapped = mapped.filter((r: any) =>
      [r.returnNumber, r.projectName, r.vendorName, r.reason].some(
        (v) => typeof v === "string" && v.toLowerCase().includes(q),
      ),
    );
  }
  return mapped;
}

export async function findGoodReturnById(
  orgId: string,
  id: string,
): Promise<any | null> {
  const rows: any[] = await (db as any).$queryRaw`
    SELECT *
    FROM app_quikinfra."Good_returns"
    WHERE "orgId" = ${orgId} AND id = ${id}
    LIMIT 1
  `;
  return rows.length ? mapRow(rows[0]) : null;
}

export async function createGoodReturn(
  input: CreateGoodReturnInput,
): Promise<any> {
  const id = genId();
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const materialsJson = JSON.stringify(lines);
  const lineCount = lines.length;
  const now = new Date();

  const toDecOrNull = (v: any): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  await (db as any).$executeRaw`
    INSERT INTO app_quikinfra."Good_returns" (
      id, "orgId", "returnNumber",
      "projectId", "projectName", "locationId", "locationName",
      "vendorId", "vendorName", "grnId", "grnNumber", "returnDate",
      reason, remarks,
      "vehicleNo", "driverName", "driverMobileNo", "challanNo",
      "transactionAmount", "intercityTransfer", "ewayBillNo",
      "photoAttachment",
      "lineCount", materials, status,
      "createdAt", "updatedAt", "createdBy", "updatedBy"
    ) VALUES (
      ${id}, ${input.orgId}, ${input.returnNumber},
      ${input.projectId ?? null}, ${input.projectName ?? null},
      ${input.locationId ?? null}, ${input.locationName ?? null},
      ${input.vendorId ?? null}, ${input.vendorName ?? null},
      ${input.grnId ?? null}, ${input.grnNumber ?? null}, ${input.returnDate},
      ${input.reason ?? null}, ${input.remarks ?? null},
      ${input.vehicleNo ?? null}, ${input.driverName ?? null},
      ${input.driverMobileNo ?? null}, ${input.challanNo ?? null},
      ${toDecOrNull(input.transactionAmount)},
      ${input.intercityTransfer === true},
      ${input.ewayBillNo ?? null}, ${input.photoAttachment ?? null},
      ${lineCount}, ${materialsJson}::jsonb, ${input.status ?? "draft"},
      ${now}, ${now}, ${input.createdBy}, ${input.createdBy}
    )
  `;

  return (await findGoodReturnById(input.orgId, id))!;
}

export async function updateGoodReturn(
  id: string,
  input: UpdateGoodReturnInput,
): Promise<any | null> {
  const existing = await findGoodReturnById(input.orgId, id);
  if (!existing) return null;
  const linesChanged = Array.isArray(input.lines);
  const lines = linesChanged ? input.lines ?? [] : existing.lines;
  const lineCount = linesChanged ? lines.length : existing.lineCount ?? 0;

  const toDecOrNull = (v: any): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const next = {
    projectName: input.projectName ?? existing.projectName,
    locationId: input.locationId ?? existing.locationId,
    locationName: input.locationName ?? existing.locationName,
    vendorName: input.vendorName ?? existing.vendorName,
    grnNumber: input.grnNumber ?? existing.grnNumber,
    returnDate: input.returnDate ?? null,
    reason: input.reason ?? existing.reason,
    remarks: input.remarks ?? existing.remarks,
    vehicleNo: input.vehicleNo ?? existing.vehicleNo,
    driverName: input.driverName ?? existing.driverName,
    driverMobileNo: input.driverMobileNo ?? existing.driverMobileNo,
    challanNo: input.challanNo ?? existing.challanNo,
    transactionAmount:
      input.transactionAmount !== undefined
        ? toDecOrNull(input.transactionAmount)
        : existing.transactionAmount,
    intercityTransfer:
      input.intercityTransfer !== undefined
        ? input.intercityTransfer === true
        : existing.intercityTransfer,
    ewayBillNo: input.ewayBillNo ?? existing.ewayBillNo,
    photoAttachment: input.photoAttachment ?? existing.photoAttachment,
    status: input.status ?? existing.status,
  };

  await (db as any).$executeRaw`
    UPDATE app_quikinfra."Good_returns"
    SET
      "projectName"       = ${next.projectName},
      "locationId"        = ${next.locationId},
      "locationName"      = ${next.locationName},
      "vendorName"        = ${next.vendorName},
      "grnNumber"         = ${next.grnNumber},
      "returnDate"        = COALESCE(${next.returnDate}, "returnDate"),
      reason              = ${next.reason},
      remarks             = ${next.remarks},
      "vehicleNo"         = ${next.vehicleNo},
      "driverName"        = ${next.driverName},
      "driverMobileNo"    = ${next.driverMobileNo},
      "challanNo"         = ${next.challanNo},
      "transactionAmount" = ${next.transactionAmount},
      "intercityTransfer" = ${next.intercityTransfer},
      "ewayBillNo"        = ${next.ewayBillNo},
      "photoAttachment"   = ${next.photoAttachment},
      status              = ${next.status},
      "lineCount"         = ${lineCount},
      materials           = ${JSON.stringify(lines)}::jsonb,
      "updatedAt"         = ${new Date()},
      "updatedBy"         = ${input.updatedBy}
    WHERE "orgId" = ${input.orgId} AND id = ${id}
  `;

  return findGoodReturnById(input.orgId, id);
}

export async function patchGoodReturnStatus(
  orgId: string,
  id: string,
  patch: {
    status?: string;
    approvalId?: string | null;
    rejectionReason?: string | null;
    returnReason?: string | null;
    submittedAt?: Date | null;
    submittedBy?: string | null;
    approvedAt?: Date | null;
    approvedBy?: string | null;
    rejectedAt?: Date | null;
    rejectedBy?: string | null;
    returnedAt?: Date | null;
    returnedBy?: string | null;
    dispatchedAt?: Date | null;
    dispatchedBy?: string | null;
    dispatchVehicleNo?: string | null;
    dispatchRemarks?: string | null;
    updatedBy: string;
  },
): Promise<any | null> {
  const existing = await findGoodReturnById(orgId, id);
  if (!existing) return null;

  const pick = <T>(v: T | undefined, fallback: T): T =>
    v !== undefined ? v : fallback;
  const dateOrNull = (v: string | null): Date | null =>
    v ? new Date(v) : null;

  const next = {
    status: pick(patch.status, existing.status),
    approvalId: pick(patch.approvalId, existing.approvalId),
    rejectionReason: pick(patch.rejectionReason, existing.rejectionReason),
    returnReason: pick(patch.returnReason, existing.returnReason),
    submittedAt: pick(patch.submittedAt, dateOrNull(existing.submittedAt)),
    submittedBy: pick(patch.submittedBy, existing.submittedBy),
    approvedAt: pick(patch.approvedAt, dateOrNull(existing.approvedAt)),
    approvedBy: pick(patch.approvedBy, existing.approvedBy),
    rejectedAt: pick(patch.rejectedAt, dateOrNull(existing.rejectedAt)),
    rejectedBy: pick(patch.rejectedBy, existing.rejectedBy),
    returnedAt: pick(patch.returnedAt, dateOrNull(existing.returnedAt)),
    returnedBy: pick(patch.returnedBy, existing.returnedBy),
    dispatchedAt: pick(patch.dispatchedAt, dateOrNull(existing.dispatchedAt)),
    dispatchedBy: pick(patch.dispatchedBy, existing.dispatchedBy),
    dispatchVehicleNo: pick(
      patch.dispatchVehicleNo,
      existing.dispatchVehicleNo,
    ),
    dispatchRemarks: pick(patch.dispatchRemarks, existing.dispatchRemarks),
  };

  await (db as any).$executeRaw`
    UPDATE app_quikinfra."Good_returns"
    SET
      status              = ${next.status},
      "approvalId"        = ${next.approvalId},
      "rejectionReason"   = ${next.rejectionReason},
      "returnReason"      = ${next.returnReason},
      "submittedAt"       = ${next.submittedAt},
      "submittedBy"       = ${next.submittedBy},
      "approvedAt"        = ${next.approvedAt},
      "approvedBy"        = ${next.approvedBy},
      "rejectedAt"        = ${next.rejectedAt},
      "rejectedBy"        = ${next.rejectedBy},
      "returnedAt"        = ${next.returnedAt},
      "returnedBy"        = ${next.returnedBy},
      "dispatchedAt"      = ${next.dispatchedAt},
      "dispatchedBy"      = ${next.dispatchedBy},
      "dispatchVehicleNo" = ${next.dispatchVehicleNo},
      "dispatchRemarks"   = ${next.dispatchRemarks},
      "updatedAt"         = ${new Date()},
      "updatedBy"         = ${patch.updatedBy}
    WHERE "orgId" = ${orgId} AND id = ${id}
  `;
  return findGoodReturnById(orgId, id);
}

export async function deleteGoodReturn(
  orgId: string,
  id: string,
): Promise<boolean> {
  const res: any = await (db as any).$executeRaw`
    DELETE FROM app_quikinfra."Good_returns"
    WHERE "orgId" = ${orgId} AND id = ${id}
  `;
  return Number(res) > 0;
}

/** Count returns whose `returnDate` (YYYY-MM-DD) matches the given key.
    Used by the create route to compute the next per-day sequence. */
export async function countGoodReturnsForDate(
  orgId: string,
  dateYYYYMMDD: string,
): Promise<number> {
  const rows: any[] = await (db as any).$queryRaw`
    SELECT COUNT(*)::int AS c
    FROM app_quikinfra."Good_returns"
    WHERE "orgId" = ${orgId}
      AND to_char("returnDate", 'YYYY-MM-DD') = ${dateYYYYMMDD}
  `;
  return Number(rows[0]?.c ?? 0);
}
