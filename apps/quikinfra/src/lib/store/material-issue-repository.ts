/**
 * Material Issue repository — Postgres-backed CRUD for
 * `cn_material_issues`. The `materials` column is JSONB; each line in
 * the array carries { itemId, itemName, uomCode, sourceLocationId,
 * reqQty, quantity, availableStock, batchNo, equipmentNo, remarks,
 * unitRate, amount }.
 *
 * Uses raw SQL throughout because the Prisma client is typically stale
 * on Windows (dev server holds the DLL so `prisma generate` fails).
 *
 * Response shape matches the legacy demo-store shape the UI already
 * reads (`issueNumber`, `projectName`, `issuedToName`, `lineCount`,
 * `lines`, etc.) so list / detail / drawer keep rendering unchanged.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";

export interface MIMaterialLine {
  itemId?: string | null;
  itemName?: string | null;
  itemCode?: string | null;
  uomCode?: string | null;
  sourceLocationId?: string | null;
  sourceLocationName?: string | null;
  reqQty?: number | string | null;
  quantity?: number | string | null;
  issueQty?: number | string | null;
  availableStock?: number | string | null;
  batchNo?: string | null;
  equipmentNo?: string | null;
  unitRate?: number | string | null;
  amount?: number | string | null;
  remarks?: string | null;
}

export interface CreateMaterialIssueInput {
  orgId: string;
  createdBy: string;
  issueNumber: string;
  projectId: string;
  projectName?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  issueDate: Date;
  issueType?: string | null;
  contractorId?: string | null;
  contractorName?: string | null;
  teamDepartment?: string | null;
  issuedToId?: string | null;
  issuedToName?: string | null;
  issuedById?: string | null;
  issuedBy?: string | null;
  receivedBy?: string | null;
  prId?: string | null;
  prNumber?: string | null;
  prReference?: string | null;
  woReference?: string | null;
  vehicleNo?: string | null;
  gatePassNo?: string | null;
  driverName?: string | null;
  driverMobileNo?: string | null;
  challanNo?: string | null;
  transactionAmount?: number | string | null;
  intercityTransfer?: boolean;
  ewayBillNo?: string | null;
  securityGuard?: string | null;
  materialCondition?: string | null;
  weighbridgeReading?: string | null;
  photoAttachment?: string | null;
  purpose?: string | null;
  remarks?: string | null;
  lines?: MIMaterialLine[];
  status?: string;
}

export interface UpdateMaterialIssueInput {
  orgId: string;
  updatedBy: string;
  projectName?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  issueType?: string | null;
  contractorId?: string | null;
  contractorName?: string | null;
  teamDepartment?: string | null;
  issuedToName?: string | null;
  issuedBy?: string | null;
  receivedBy?: string | null;
  prReference?: string | null;
  woReference?: string | null;
  vehicleNo?: string | null;
  gatePassNo?: string | null;
  transactionAmount?: number | string | null;
  intercityTransfer?: boolean;
  ewayBillNo?: string | null;
  materialCondition?: string | null;
  photoAttachment?: string | null;
  purpose?: string | null;
  remarks?: string | null;
  lines?: MIMaterialLine[] | null;
  status?: string;
}

function genId(): string {
  if (typeof (globalThis as any).crypto?.randomUUID === "function") {
    return (globalThis as any).crypto.randomUUID();
  }
  return `mi_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function mapRow(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    issueNumber: row.issueNumber,
    projectId: row.projectId,
    projectName: row.projectName ?? null,
    locationId: row.locationId ?? null,
    locationName: row.locationName ?? null,
    issuedToId: row.issuedToId ?? null,
    issuedToName: row.issuedToName ?? null,
    issuedById: row.issuedById ?? null,
    issueDate: row.issueDate
      ? (typeof row.issueDate === "string"
          ? row.issueDate.slice(0, 10)
          : row.issueDate.toISOString?.().slice(0, 10) ?? null)
      : null,
    issueType: row.issueType ?? null,
    contractorId: row.contractorId ?? null,
    contractorName: row.contractorName ?? null,
    teamDepartment: row.teamDepartment ?? null,
    issuedBy: row.issuedBy ?? null,
    receivedBy: row.receivedBy ?? null,
    prId: row.prId ?? null,
    prNumber: row.prNumber ?? null,
    prReference: row.prReference ?? null,
    woReference: row.woReference ?? null,
    vehicleNo: row.vehicleNo ?? null,
    gatePassNo: row.gatePassNo ?? null,
    driverName: row.driverName ?? null,
    driverMobileNo: row.driverMobileNo ?? null,
    challanNo: row.challanNo ?? null,
    transactionAmount:
      row.transactionAmount != null ? Number(row.transactionAmount) : 0,
    intercityTransfer: !!row.intercityTransfer,
    ewayBillNo: row.ewayBillNo ?? null,
    securityGuard: row.securityGuard ?? null,
    materialCondition: row.materialCondition ?? null,
    weighbridgeReading: row.weighbridgeReading ?? null,
    photoAttachment: row.photoAttachment ?? null,
    purpose: row.purpose ?? null,
    remarks: row.remarks ?? null,
    lineCount: row.lineCount ?? 0,
    // UI reads `lines` everywhere; keep the name familiar even though
    // the column is `materials`.
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
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt ?? null,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
  };
}

export interface ListMaterialIssuesOptions {
  status?: string | null;
  projectId?: string | null;
  prId?: string | null;
  search?: string | null;
  allowedProjectIds?: string[] | null;
  /** Pagination — push LIMIT/OFFSET down into the raw SQL. */
  take?: number;
  skip?: number;
}

// Build the WHERE fragment once so list and count stay in sync. Returns
// `Prisma.empty` when no filters apply, otherwise ` WHERE <conds AND ...>`.
function buildMaterialIssuesWhere(
  orgId: string,
  opts: Omit<ListMaterialIssuesOptions, "take" | "skip">,
): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`"orgId" = ${orgId}`];

  const allowed = opts.allowedProjectIds ?? null;
  if (allowed !== null && allowed.length > 0) {
    conds.push(Prisma.sql`"projectId" = ANY(${allowed}::text[])`);
  }
  if (opts.status && opts.status !== "all") {
    conds.push(Prisma.sql`status = ${opts.status}`);
  }
  if (opts.projectId) {
    conds.push(Prisma.sql`"projectId" = ${opts.projectId}`);
  }
  if (opts.prId) {
    conds.push(Prisma.sql`"prId" = ${opts.prId}`);
  }
  if (opts.search) {
    const q = `%${opts.search.toLowerCase()}%`;
    conds.push(Prisma.sql`(
      LOWER("issueNumber") LIKE ${q}
      OR LOWER(COALESCE("projectName", '')) LIKE ${q}
      OR LOWER(COALESCE(purpose, '')) LIKE ${q}
    )`);
  }
  return Prisma.sql` WHERE ${Prisma.join(conds, " AND ")}`;
}

export async function listMaterialIssues(
  orgId: string,
  opts: ListMaterialIssuesOptions = {},
): Promise<any[]> {
  const allowed = opts.allowedProjectIds ?? null;
  if (allowed !== null && allowed.length === 0) return [];

  const where = buildMaterialIssuesWhere(orgId, opts);
  const limitClause = typeof opts.take === "number"
    ? Prisma.sql` LIMIT ${opts.take}`
    : Prisma.empty;
  const offsetClause = typeof opts.skip === "number"
    ? Prisma.sql` OFFSET ${opts.skip}`
    : Prisma.empty;

  // Compose with `Prisma.sql` and pass to $queryRaw as a function call.
  // The tagged-template form (db.$queryRaw`...`) does not reliably
  // re-number $-placeholders when nesting pre-built `Prisma.Sql` fragments
  // on Prisma 5.22.x — inner $1 placeholders leak through as literal
  // text and Postgres throws `42601 syntax error at or near "$1"`.
  const query = Prisma.sql`
    SELECT
      id, "orgId", "issueNumber",
      "projectId", "projectName", "locationId", "locationName",
      "issuedToId", "issuedToName", "issuedById", "issueDate",
      "issueType", "contractorId", "contractorName", "teamDepartment",
      "issuedBy", "receivedBy",
      "prId", "prNumber", "prReference", "woReference",
      "vehicleNo", "gatePassNo", "driverName", "driverMobileNo", "challanNo",
      "transactionAmount", "intercityTransfer", "ewayBillNo",
      "securityGuard", "materialCondition", "weighbridgeReading",
      "photoAttachment", purpose, remarks, "lineCount", materials,
      status, "approvalId", "rejectionReason", "returnReason",
      "submittedAt", "submittedBy", "approvedAt", "approvedBy",
      "rejectedAt", "rejectedBy", "returnedAt", "returnedBy",
      "createdAt", "updatedAt", "createdBy", "updatedBy"
    FROM app_quikinfra."Material_issues"
    ${where}
    ORDER BY "issueDate" DESC NULLS LAST, "createdAt" DESC
    ${limitClause}${offsetClause}
  `;
  const rows: any[] = await (db as any).$queryRaw(query);
  return rows.map(mapRow);
}

export async function countMaterialIssues(
  orgId: string,
  opts: Omit<ListMaterialIssuesOptions, "take" | "skip"> = {},
): Promise<number> {
  const allowed = opts.allowedProjectIds ?? null;
  if (allowed !== null && allowed.length === 0) return 0;
  const where = buildMaterialIssuesWhere(orgId, opts);
  // Same composition pattern as listMaterialIssues — see comment there
  // for why we avoid the tagged-template form when nesting fragments.
  const query = Prisma.sql`
    SELECT COUNT(*)::bigint AS c FROM app_quikinfra."Material_issues"${where}
  `;
  const rows: Array<{ c: bigint }> = await (db as any).$queryRaw(query);
  return Number(rows[0]?.c ?? 0);
}

export async function findMaterialIssueById(
  orgId: string,
  id: string,
): Promise<any | null> {
  const rows: any[] = await (db as any).$queryRaw`
    SELECT
      id, "orgId", "issueNumber",
      "projectId", "projectName", "locationId", "locationName",
      "issuedToId", "issuedToName", "issuedById", "issueDate",
      "issueType", "contractorId", "contractorName", "teamDepartment",
      "issuedBy", "receivedBy",
      "prId", "prNumber", "prReference", "woReference",
      "vehicleNo", "gatePassNo", "driverName", "driverMobileNo", "challanNo",
      "transactionAmount", "intercityTransfer", "ewayBillNo",
      "securityGuard", "materialCondition", "weighbridgeReading",
      "photoAttachment", purpose, remarks, "lineCount", materials,
      status, "approvalId", "rejectionReason", "returnReason",
      "submittedAt", "submittedBy", "approvedAt", "approvedBy",
      "rejectedAt", "rejectedBy", "returnedAt", "returnedBy",
      "createdAt", "updatedAt", "createdBy", "updatedBy"
    FROM app_quikinfra."Material_issues"
    WHERE "orgId" = ${orgId} AND id = ${id}
    LIMIT 1
  `;
  return rows.length ? mapRow(rows[0]) : null;
}

export async function createMaterialIssue(
  input: CreateMaterialIssueInput,
): Promise<any> {
  const id = genId();
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const materialsJson = JSON.stringify(lines);
  const lineCount = lines.length;
  const now = new Date();

  await (db as any).$executeRaw`
    INSERT INTO app_quikinfra."Material_issues" (
      id, "orgId", "issueNumber",
      "projectId", "projectName", "locationId", "locationName",
      "issuedToId", "issuedToName", "issuedById", "issueDate",
      "issueType", "contractorId", "contractorName", "teamDepartment",
      "issuedBy", "receivedBy",
      "prId", "prNumber", "prReference", "woReference",
      "vehicleNo", "gatePassNo", "driverName", "driverMobileNo", "challanNo",
      "transactionAmount", "intercityTransfer", "ewayBillNo",
      "securityGuard", "materialCondition", "weighbridgeReading",
      "photoAttachment", purpose, remarks, "lineCount", materials,
      status, "createdAt", "updatedAt", "createdBy", "updatedBy"
    ) VALUES (
      ${id}, ${input.orgId}, ${input.issueNumber},
      ${input.projectId}, ${input.projectName ?? null},
      ${input.locationId ?? null}, ${input.locationName ?? null},
      ${input.issuedToId ?? null}, ${input.issuedToName ?? null},
      ${input.issuedById ?? null}, ${input.issueDate},
      ${input.issueType ?? null}, ${input.contractorId ?? null},
      ${input.contractorName ?? null}, ${input.teamDepartment ?? null},
      ${input.issuedBy ?? null}, ${input.receivedBy ?? null},
      ${input.prId ?? null}, ${input.prNumber ?? null},
      ${input.prReference ?? null}, ${input.woReference ?? null},
      ${input.vehicleNo ?? null}, ${input.gatePassNo ?? null},
      ${input.driverName ?? null}, ${input.driverMobileNo ?? null},
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
      ${input.photoAttachment ?? null},
      ${input.purpose ?? null}, ${input.remarks ?? null},
      ${lineCount}, ${materialsJson}::jsonb,
      ${input.status ?? "draft"},
      ${now}, ${now}, ${input.createdBy}, ${input.createdBy}
    )
  `;

  return (await findMaterialIssueById(input.orgId, id))!;
}

export async function updateMaterialIssue(
  id: string,
  input: UpdateMaterialIssueInput,
): Promise<any | null> {
  const existing = await findMaterialIssueById(input.orgId, id);
  if (!existing) return null;
  const linesChanged = Array.isArray(input.lines);
  const lines = linesChanged ? input.lines ?? [] : existing.lines;
  const lineCount = linesChanged ? lines.length : existing.lineCount ?? 0;

  const next = {
    projectName: input.projectName ?? existing.projectName,
    locationId: input.locationId ?? existing.locationId,
    locationName: input.locationName ?? existing.locationName,
    issueType: input.issueType ?? existing.issueType,
    contractorId: input.contractorId ?? existing.contractorId,
    contractorName: input.contractorName ?? existing.contractorName,
    teamDepartment: input.teamDepartment ?? existing.teamDepartment,
    issuedToName: input.issuedToName ?? existing.issuedToName,
    issuedBy: input.issuedBy ?? existing.issuedBy,
    receivedBy: input.receivedBy ?? existing.receivedBy,
    prReference: input.prReference ?? existing.prReference,
    woReference: input.woReference ?? existing.woReference,
    vehicleNo: input.vehicleNo ?? existing.vehicleNo,
    gatePassNo: input.gatePassNo ?? existing.gatePassNo,
    transactionAmount:
      input.transactionAmount !== undefined
        ? input.transactionAmount
        : existing.transactionAmount,
    intercityTransfer:
      input.intercityTransfer !== undefined
        ? input.intercityTransfer
        : existing.intercityTransfer,
    ewayBillNo: input.ewayBillNo ?? existing.ewayBillNo,
    materialCondition: input.materialCondition ?? existing.materialCondition,
    photoAttachment: input.photoAttachment ?? existing.photoAttachment,
    purpose: input.purpose ?? existing.purpose,
    remarks: input.remarks ?? existing.remarks,
    status: input.status ?? existing.status,
  };

  await (db as any).$executeRaw`
    UPDATE app_quikinfra."Material_issues"
    SET
      "projectName"       = ${next.projectName},
      "locationId"        = ${next.locationId},
      "locationName"      = ${next.locationName},
      "issueType"         = ${next.issueType},
      "contractorId"      = ${next.contractorId},
      "contractorName"    = ${next.contractorName},
      "teamDepartment"    = ${next.teamDepartment},
      "issuedToName"      = ${next.issuedToName},
      "issuedBy"          = ${next.issuedBy},
      "receivedBy"        = ${next.receivedBy},
      "prReference"       = ${next.prReference},
      "woReference"       = ${next.woReference},
      "vehicleNo"         = ${next.vehicleNo},
      "gatePassNo"        = ${next.gatePassNo},
      "transactionAmount" = ${
        next.transactionAmount != null
          ? String(next.transactionAmount)
          : null
      }::numeric,
      "intercityTransfer" = ${!!next.intercityTransfer},
      "ewayBillNo"        = ${next.ewayBillNo},
      "materialCondition" = ${next.materialCondition},
      "photoAttachment"   = ${next.photoAttachment},
      purpose             = ${next.purpose},
      remarks             = ${next.remarks},
      status              = ${next.status},
      "lineCount"         = ${lineCount},
      materials           = ${JSON.stringify(lines)}::jsonb,
      "updatedAt"         = ${new Date()},
      "updatedBy"         = ${input.updatedBy}
    WHERE "orgId" = ${input.orgId} AND id = ${id}
  `;

  return findMaterialIssueById(input.orgId, id);
}

export async function patchMaterialIssueStatus(
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
    updatedBy: string;
  },
): Promise<any | null> {
  const existing = await findMaterialIssueById(orgId, id);
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
      patch.submittedBy !== undefined
        ? patch.submittedBy
        : existing.submittedBy,
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
  };

  await (db as any).$executeRaw`
    UPDATE app_quikinfra."Material_issues"
    SET
      status            = ${next.status},
      "approvalId"      = ${next.approvalId},
      "rejectionReason" = ${next.rejectionReason},
      "returnReason"    = ${next.returnReason},
      "submittedAt"     = ${next.submittedAt},
      "submittedBy"     = ${next.submittedBy},
      "approvedAt"      = ${next.approvedAt},
      "approvedBy"      = ${next.approvedBy},
      "rejectedAt"      = ${next.rejectedAt},
      "rejectedBy"      = ${next.rejectedBy},
      "returnedAt"      = ${next.returnedAt},
      "returnedBy"      = ${next.returnedBy},
      "updatedAt"       = ${new Date()},
      "updatedBy"       = ${patch.updatedBy}
    WHERE "orgId" = ${orgId} AND id = ${id}
  `;
  return findMaterialIssueById(orgId, id);
}

export async function deleteMaterialIssue(
  orgId: string,
  id: string,
): Promise<boolean> {
  const res: any = await (db as any).$executeRaw`
    DELETE FROM app_quikinfra."Material_issues"
    WHERE "orgId" = ${orgId} AND id = ${id}
  `;
  return Number(res) > 0;
}

/** Count issues whose issueDate (YYYY-MM-DD) matches the given key.
    Used by the list/create route to compute the next per-day sequence. */
export async function countMaterialIssuesForDate(
  orgId: string,
  dateYYYYMMDD: string,
): Promise<number> {
  const rows: any[] = await (db as any).$queryRaw`
    SELECT COUNT(*)::int AS c
    FROM app_quikinfra."Material_issues"
    WHERE "orgId" = ${orgId}
      AND to_char("issueDate", 'YYYY-MM-DD') = ${dateYYYYMMDD}
  `;
  return Number(rows[0]?.c ?? 0);
}
