/**
 * Gate Pass repository — Postgres-backed CRUD for `gate_passes`.
 *
 * Lines live inside the `materials` JSONB column (same pattern we use
 * for Material Issue / Material Estimation). Each line carries
 * { itemId, materialDescription, uomCode, quantity, remarks }.
 *
 * Uses raw SQL end-to-end because the Prisma client DLL gets locked
 * by the dev server on Windows — raw SQL sidesteps the `prisma
 * generate` cycle.
 *
 * Response shape mirrors what the UI already reads from the legacy
 * demo-store record so the list + create + future detail page render
 * without adapter code (`gatePassNumber`, `projectName`, `vehicleNo`,
 * `lineCount`, `lines`, etc.).
 */

import { db } from "@/lib/db/prisma";

export interface GatePassLine {
  itemId?: string | null;
  itemName?: string | null;
  materialDescription?: string | null;
  uomCode?: string | null;
  quantity?: number | string | null;
  remarks?: string | null;
}

export interface CreateGatePassInput {
  tenantId: string;
  orgId: string;
  createdBy: string;
  gatePassNumber: string;
  type: string;
  projectId?: string | null;
  projectName?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  gatePassDate: Date;
  expectedReturnDate?: Date | null;
  referenceType?: string | null;
  referenceNo?: string | null;
  referenceId?: string | null;
  referenceNumber?: string | null;
  vehicleNo?: string | null;
  driverName?: string | null;
  driverMobileNo?: string | null;
  driverPhone?: string | null;
  challanNo?: string | null;
  transactionAmount?: number | string | null;
  intercityTransfer?: boolean;
  ewayBillNo?: string | null;
  securityGuard?: string | null;
  materialCondition?: string | null;
  weighbridgeReading?: string | null;
  vehiclePhoto?: string | null;
  purpose?: string | null;
  remarks?: string | null;
  authorizedById?: string | null;
  lines?: GatePassLine[];
  status?: string;
}

export interface UpdateGatePassInput {
  tenantId: string;
  updatedBy: string;
  type?: string;
  projectName?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  gatePassDate?: Date | null;
  expectedReturnDate?: Date | null;
  referenceType?: string | null;
  referenceNo?: string | null;
  vehicleNo?: string | null;
  driverName?: string | null;
  driverMobileNo?: string | null;
  challanNo?: string | null;
  transactionAmount?: number | string | null;
  intercityTransfer?: boolean;
  ewayBillNo?: string | null;
  securityGuard?: string | null;
  materialCondition?: string | null;
  weighbridgeReading?: string | null;
  vehiclePhoto?: string | null;
  purpose?: string | null;
  remarks?: string | null;
  lines?: GatePassLine[] | null;
  status?: string;
}

function genId(): string {
  if (typeof (globalThis as any).crypto?.randomUUID === "function") {
    return (globalThis as any).crypto.randomUUID();
  }
  return `gp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
    tenantId: row.tenantId,
    orgId: row.orgId,
    gatePassNumber: row.gatePassNumber,
    type: row.type,
    projectId: row.projectId ?? null,
    projectName: row.projectName ?? null,
    locationId: row.locationId ?? null,
    locationName: row.locationName ?? null,
    gatePassDate: toIsoDate(row.gatePassDate),
    expectedReturnDate: toIsoDate(row.expectedReturnDate),
    actualReturnDate: toIsoDate(row.actualReturnDate),
    referenceType: row.referenceType ?? null,
    referenceNo: row.referenceNo ?? row.referenceNumber ?? null,
    referenceId: row.referenceId ?? null,
    referenceNumber: row.referenceNumber ?? null,
    vehicleNo: row.vehicleNo ?? null,
    driverName: row.driverName ?? null,
    driverMobileNo: row.driverMobileNo ?? row.driverPhone ?? null,
    driverPhone: row.driverPhone ?? null,
    challanNo: row.challanNo ?? null,
    transactionAmount:
      row.transactionAmount != null ? Number(row.transactionAmount) : 0,
    intercityTransfer: !!row.intercityTransfer,
    ewayBillNo: row.ewayBillNo ?? null,
    securityGuard: row.securityGuard ?? null,
    materialCondition: row.materialCondition ?? null,
    weighbridgeReading: row.weighbridgeReading ?? null,
    vehiclePhoto: row.vehiclePhoto ?? null,
    purpose: row.purpose ?? null,
    remarks: row.remarks ?? null,
    lineCount: row.lineCount ?? 0,
    // Expose the JSONB as `lines` — the shape the list/detail pages
    // have always read.
    lines: Array.isArray(row.materials) ? row.materials : [],
    authorizedById: row.authorizedById ?? null,
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
    closedAt: row.closedAt?.toISOString?.() ?? row.closedAt ?? null,
    closedBy: row.closedBy ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt ?? null,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
  };
}

export async function listGatePasses(
  tenantId: string,
  opts: {
    status?: string | null;
    type?: string | null;
    projectId?: string | null;
    search?: string | null;
    allowedProjectIds?: string[] | null;
  } = {},
): Promise<any[]> {
  const allowed = opts.allowedProjectIds ?? null;
  if (allowed !== null && allowed.length === 0) return [];

  const rows: any[] = await (db as any).$queryRaw`
    SELECT *
    FROM app_quikconstruction."Gate_passes"
    WHERE "tenantId" = ${tenantId}
    ORDER BY "gatePassDate" DESC NULLS LAST, "createdAt" DESC
  `;
  let mapped = rows.map(mapRow);

  if (allowed !== null) {
    const set = new Set(allowed);
    // Allow rows with no projectId (rare; gate-house may tag nothing)
    // through so gate-house staff still see them.
    mapped = mapped.filter(
      (r: any) => !r.projectId || set.has(r.projectId),
    );
  }
  if (opts.status && opts.status !== "all") {
    if (opts.status === "issued") {
      mapped = mapped.filter((g: any) =>
        ["draft", "pending_approval", "approved", "issued"].includes(
          String(g.status ?? "").toLowerCase(),
        ),
      );
    } else {
      mapped = mapped.filter(
        (g: any) =>
          String(g.status ?? "").toLowerCase() === opts.status,
      );
    }
  }
  if (opts.type && opts.type !== "all") {
    mapped = mapped.filter(
      (g: any) => String(g.type ?? "").toLowerCase() === opts.type,
    );
  }
  if (opts.projectId) {
    mapped = mapped.filter((g: any) => g.projectId === opts.projectId);
  }
  if (opts.search) {
    const q = opts.search.toLowerCase();
    mapped = mapped.filter((g: any) =>
      [g.gatePassNumber, g.projectName, g.vehicleNo, g.referenceNo].some(
        (v) => typeof v === "string" && v.toLowerCase().includes(q),
      ),
    );
  }
  return mapped;
}

export async function findGatePassById(
  tenantId: string,
  id: string,
): Promise<any | null> {
  const rows: any[] = await (db as any).$queryRaw`
    SELECT *
    FROM app_quikconstruction."Gate_passes"
    WHERE "tenantId" = ${tenantId} AND id = ${id}
    LIMIT 1
  `;
  return rows.length ? mapRow(rows[0]) : null;
}

export async function createGatePass(
  input: CreateGatePassInput,
): Promise<any> {
  const id = genId();
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const materialsJson = JSON.stringify(lines);
  const lineCount = lines.length;
  const now = new Date();

  await (db as any).$executeRaw`
    INSERT INTO app_quikconstruction."Gate_passes" (
      id, "tenantId", "orgId", "gatePassNumber", type,
      "projectId", "projectName", "locationId", "locationName",
      "gatePassDate", "expectedReturnDate",
      "referenceType", "referenceNo", "referenceId", "referenceNumber",
      "vehicleNo", "driverName", "driverMobileNo", "driverPhone", "challanNo",
      "transactionAmount", "intercityTransfer", "ewayBillNo",
      "securityGuard", "materialCondition", "weighbridgeReading",
      "vehiclePhoto", purpose, remarks,
      "lineCount", materials,
      "authorizedById", status,
      "createdAt", "updatedAt", "createdBy", "updatedBy"
    ) VALUES (
      ${id}, ${input.tenantId}, ${input.orgId}, ${input.gatePassNumber}, ${input.type},
      ${input.projectId ?? null}, ${input.projectName ?? null},
      ${input.locationId ?? null}, ${input.locationName ?? null},
      ${input.gatePassDate}, ${input.expectedReturnDate ?? null},
      ${input.referenceType ?? null}, ${input.referenceNo ?? null},
      ${input.referenceId ?? null}, ${input.referenceNumber ?? null},
      ${input.vehicleNo ?? null}, ${input.driverName ?? null},
      ${input.driverMobileNo ?? null}, ${input.driverPhone ?? null},
      ${input.challanNo ?? null},
      ${
        input.transactionAmount != null
          ? String(input.transactionAmount)
          : null
      }::numeric,
      ${!!input.intercityTransfer},
      ${input.ewayBillNo ?? null},
      ${input.securityGuard ?? null}, ${input.materialCondition ?? null},
      ${input.weighbridgeReading ?? null},
      ${input.vehiclePhoto ?? null}, ${input.purpose ?? null}, ${input.remarks ?? null},
      ${lineCount}, ${materialsJson}::jsonb,
      ${input.authorizedById ?? null}, ${input.status ?? "draft"},
      ${now}, ${now}, ${input.createdBy}, ${input.createdBy}
    )
  `;

  return (await findGatePassById(input.tenantId, id))!;
}

export async function updateGatePass(
  id: string,
  input: UpdateGatePassInput,
): Promise<any | null> {
  const existing = await findGatePassById(input.tenantId, id);
  if (!existing) return null;
  const linesChanged = Array.isArray(input.lines);
  const lines = linesChanged ? input.lines ?? [] : existing.lines;
  const lineCount = linesChanged ? lines.length : existing.lineCount ?? 0;

  const next = {
    type: input.type ?? existing.type,
    projectName: input.projectName ?? existing.projectName,
    locationId: input.locationId ?? existing.locationId,
    locationName: input.locationName ?? existing.locationName,
    gatePassDate: input.gatePassDate ?? null,
    expectedReturnDate: input.expectedReturnDate ?? null,
    referenceType: input.referenceType ?? existing.referenceType,
    referenceNo: input.referenceNo ?? existing.referenceNo,
    vehicleNo: input.vehicleNo ?? existing.vehicleNo,
    driverName: input.driverName ?? existing.driverName,
    driverMobileNo: input.driverMobileNo ?? existing.driverMobileNo,
    challanNo: input.challanNo ?? existing.challanNo,
    transactionAmount:
      input.transactionAmount !== undefined
        ? input.transactionAmount
        : existing.transactionAmount,
    intercityTransfer:
      input.intercityTransfer !== undefined
        ? input.intercityTransfer
        : existing.intercityTransfer,
    ewayBillNo: input.ewayBillNo ?? existing.ewayBillNo,
    securityGuard: input.securityGuard ?? existing.securityGuard,
    materialCondition: input.materialCondition ?? existing.materialCondition,
    weighbridgeReading:
      input.weighbridgeReading ?? existing.weighbridgeReading,
    vehiclePhoto: input.vehiclePhoto ?? existing.vehiclePhoto,
    purpose: input.purpose ?? existing.purpose,
    remarks: input.remarks ?? existing.remarks,
    status: input.status ?? existing.status,
  };

  await (db as any).$executeRaw`
    UPDATE app_quikconstruction."Gate_passes"
    SET
      type                 = ${next.type},
      "projectName"        = ${next.projectName},
      "locationId"         = ${next.locationId},
      "locationName"       = ${next.locationName},
      "gatePassDate"       = COALESCE(${next.gatePassDate}, "gatePassDate"),
      "expectedReturnDate" = COALESCE(${next.expectedReturnDate}, "expectedReturnDate"),
      "referenceType"      = ${next.referenceType},
      "referenceNo"        = ${next.referenceNo},
      "vehicleNo"          = ${next.vehicleNo},
      "driverName"         = ${next.driverName},
      "driverMobileNo"     = ${next.driverMobileNo},
      "challanNo"          = ${next.challanNo},
      "transactionAmount"  = ${
        next.transactionAmount != null
          ? String(next.transactionAmount)
          : null
      }::numeric,
      "intercityTransfer"  = ${!!next.intercityTransfer},
      "ewayBillNo"         = ${next.ewayBillNo},
      "securityGuard"      = ${next.securityGuard},
      "materialCondition"  = ${next.materialCondition},
      "weighbridgeReading" = ${next.weighbridgeReading},
      "vehiclePhoto"       = ${next.vehiclePhoto},
      purpose              = ${next.purpose},
      remarks              = ${next.remarks},
      status               = ${next.status},
      "lineCount"          = ${lineCount},
      materials            = ${JSON.stringify(lines)}::jsonb,
      "updatedAt"          = ${new Date()},
      "updatedBy"          = ${input.updatedBy}
    WHERE "tenantId" = ${input.tenantId} AND id = ${id}
  `;

  return findGatePassById(input.tenantId, id);
}

export async function patchGatePassStatus(
  tenantId: string,
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
    closedAt?: Date | null;
    closedBy?: string | null;
    actualReturnDate?: Date | null;
    updatedBy: string;
  },
): Promise<any | null> {
  const existing = await findGatePassById(tenantId, id);
  if (!existing) return null;

  const next = {
    status: patch.status ?? existing.status,
    approvalId:
      patch.approvalId !== undefined ? patch.approvalId : existing.approvalId,
    rejectionReason:
      patch.rejectionReason !== undefined
        ? patch.rejectionReason
        : existing.rejectionReason,
    returnReason:
      patch.returnReason !== undefined
        ? patch.returnReason
        : existing.returnReason,
    submittedAt:
      patch.submittedAt !== undefined
        ? patch.submittedAt
        : existing.submittedAt
          ? new Date(existing.submittedAt)
          : null,
    submittedBy:
      patch.submittedBy !== undefined ? patch.submittedBy : existing.submittedBy,
    approvedAt:
      patch.approvedAt !== undefined
        ? patch.approvedAt
        : existing.approvedAt
          ? new Date(existing.approvedAt)
          : null,
    approvedBy:
      patch.approvedBy !== undefined ? patch.approvedBy : existing.approvedBy,
    rejectedAt:
      patch.rejectedAt !== undefined
        ? patch.rejectedAt
        : existing.rejectedAt
          ? new Date(existing.rejectedAt)
          : null,
    rejectedBy:
      patch.rejectedBy !== undefined ? patch.rejectedBy : existing.rejectedBy,
    returnedAt:
      patch.returnedAt !== undefined
        ? patch.returnedAt
        : existing.returnedAt
          ? new Date(existing.returnedAt)
          : null,
    returnedBy:
      patch.returnedBy !== undefined ? patch.returnedBy : existing.returnedBy,
    closedAt:
      patch.closedAt !== undefined
        ? patch.closedAt
        : existing.closedAt
          ? new Date(existing.closedAt)
          : null,
    closedBy: patch.closedBy !== undefined ? patch.closedBy : existing.closedBy,
    actualReturnDate:
      patch.actualReturnDate !== undefined
        ? patch.actualReturnDate
        : existing.actualReturnDate
          ? new Date(existing.actualReturnDate)
          : null,
  };

  await (db as any).$executeRaw`
    UPDATE app_quikconstruction."Gate_passes"
    SET
      status             = ${next.status},
      "approvalId"       = ${next.approvalId},
      "rejectionReason"  = ${next.rejectionReason},
      "returnReason"     = ${next.returnReason},
      "submittedAt"      = ${next.submittedAt},
      "submittedBy"      = ${next.submittedBy},
      "approvedAt"       = ${next.approvedAt},
      "approvedBy"       = ${next.approvedBy},
      "rejectedAt"       = ${next.rejectedAt},
      "rejectedBy"       = ${next.rejectedBy},
      "returnedAt"       = ${next.returnedAt},
      "returnedBy"       = ${next.returnedBy},
      "closedAt"         = ${next.closedAt},
      "closedBy"         = ${next.closedBy},
      "actualReturnDate" = ${next.actualReturnDate},
      "updatedAt"        = ${new Date()},
      "updatedBy"        = ${patch.updatedBy}
    WHERE "tenantId" = ${tenantId} AND id = ${id}
  `;
  return findGatePassById(tenantId, id);
}

export async function deleteGatePass(
  tenantId: string,
  id: string,
): Promise<boolean> {
  const res: any = await (db as any).$executeRaw`
    DELETE FROM app_quikconstruction."Gate_passes"
    WHERE "tenantId" = ${tenantId} AND id = ${id}
  `;
  return Number(res) > 0;
}

/** Next sequence number for the given (year, direction) pair. `direction`
    is "IN" or "OUT" — matches the gate-house book where inward and
    outward counters run independently. */
export async function nextGatePassSequence(
  tenantId: string,
  year4: string,
  direction: "IN" | "OUT",
): Promise<number> {
  const typesForDirection =
    direction === "IN" ? ["inward"] : ["outward", "returnable", "non_returnable"];
  const rows: any[] = await (db as any).$queryRaw`
    SELECT COUNT(*)::int AS c
    FROM app_quikconstruction."Gate_passes"
    WHERE "tenantId" = ${tenantId}
      AND to_char("gatePassDate", 'YYYY') = ${year4}
      AND LOWER(type) = ANY(${typesForDirection}::text[])
  `;
  return Number(rows[0]?.c ?? 0) + 1;
}
