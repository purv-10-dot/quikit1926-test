/**
 * Material Estimation repository — Postgres-backed CRUD for
 * `cn_material_estimations`. The `materials` column is JSONB; each line
 * in the array carries { itemId, itemName, uomCode, qtyPerUnit,
 * wastePercent, totalQty, standardRate, estimatedCost }.
 *
 * Uses raw SQL throughout because the Prisma client at
 * `node_modules/.prisma-qc/client` is often stale on Windows (dev
 * server holds the DLL, so `prisma generate` fails). Raw SQL via
 * `$queryRaw` / `$executeRaw` is drift-tolerant and doesn't rely on
 * the generated client knowing every column.
 *
 * Response shape is compatible with the demo-store shape the UI was
 * already reading (`boqNo`, `boqDescription`, `materials`, `materialCount`,
 * `totalCost`, etc.) so list/detail pages keep rendering unchanged.
 */

import { db } from "@/lib/db";

export interface EstimationMaterialLine {
  itemId: string;
  itemName?: string | null;
  uomCode?: string | null;
  qtyPerUnit: number | string;
  wastePercent: number | string;
  totalQty?: number | string;
  standardRate: number | string;
  estimatedCost?: number | string;
}

export interface CreateEstimationInput {
  orgId: string;
  createdBy: string;
  projectId: string;
  projectName?: string | null;
  boqItemId: string;
  boqNo?: string | null;
  boqDescription?: string | null;
  boqQuantity?: number | string | null;
  boqUnit?: string | null;
  phase?: string | null;
  status?: string | null;
  materials: EstimationMaterialLine[];
}

export interface UpdateEstimationInput {
  orgId: string;
  updatedBy: string;
  projectName?: string | null;
  boqNo?: string | null;
  boqDescription?: string | null;
  boqQuantity?: number | string | null;
  boqUnit?: string | null;
  phase?: string | null;
  status?: string | null;
  materials?: EstimationMaterialLine[] | null;
}

function genId(): string {
  // `cuid()` isn't available (no package); random UUID is unique enough
  // for a synthetic PK and sorts consistently.
  if (typeof (globalThis as any).crypto?.randomUUID === "function") {
    return (globalThis as any).crypto.randomUUID();
  }
  // Fallback — vanishingly rare on modern Node.
  return `est_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toNum(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rollup(materials: EstimationMaterialLine[]): {
  totalQty: number;
  totalCost: number;
  materialCount: number;
} {
  let totalQty = 0;
  let totalCost = 0;
  for (const m of materials ?? []) {
    totalQty += toNum(m.totalQty ?? 0);
    totalCost += toNum(m.estimatedCost ?? 0);
  }
  return {
    totalQty,
    totalCost,
    materialCount: Array.isArray(materials) ? materials.length : 0,
  };
}

// Shape the raw DB row into the object the UI has been consuming from
// the demo-store. Decimals come back as strings from pg; coerce them to
// numbers for easy rendering.
function mapRow(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    projectId: row.projectId,
    projectName: row.projectName ?? null,
    boqItemId: row.boqItemId,
    boqNo: row.boqNo ?? null,
    boqDescription: row.boqDescription ?? null,
    boqQuantity: row.boqQuantity != null ? Number(row.boqQuantity) : null,
    boqUnit: row.boqUnit ?? null,
    phase: row.phase ?? null,
    status: row.status ?? "draft",
    totalQty: row.totalQty != null ? Number(row.totalQty) : 0,
    totalCost: row.totalCost != null ? Number(row.totalCost) : 0,
    materialCount: row.materialCount ?? 0,
    materials: Array.isArray(row.materials) ? row.materials : [],
    approvalId: row.approvalId ?? null,
    rejectionReason: row.rejectionReason ?? null,
    returnReason: row.returnReason ?? null,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString?.() ?? String(row.submittedAt) : null,
    submittedBy: row.submittedBy ?? null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString?.() ?? String(row.approvedAt) : null,
    approvedBy: row.approvedBy ?? null,
    rejectedAt: row.rejectedAt ? row.rejectedAt.toISOString?.() ?? String(row.rejectedAt) : null,
    rejectedBy: row.rejectedBy ?? null,
    returnedAt: row.returnedAt ? row.returnedAt.toISOString?.() ?? String(row.returnedAt) : null,
    returnedBy: row.returnedBy ?? null,
    createdAt: row.createdAt ? row.createdAt.toISOString?.() ?? String(row.createdAt) : null,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString?.() ?? String(row.updatedAt) : null,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
  };
}

export async function listEstimations(
  orgId: string,
  opts: {
    projectId?: string | null;
    allowedProjectIds?: string[] | null;
    search?: string | null;
  } = {},
): Promise<any[]> {
  const projectId = opts.projectId ?? null;
  const search = (opts.search ?? "").trim().toLowerCase();
  const allowed = opts.allowedProjectIds ?? null;

  // Fast-path: when the caller's project scope is empty, skip the
  // query — no rows to return.
  if (allowed !== null && allowed.length === 0) return [];

  // Tenant + optional projectId filter done in SQL (indexed). The
  // allowed-project-id list is enforced in JS after fetch to sidestep
  // Prisma's array-parameter quirks with `ANY($n::text[])`; the
  // dataset is small per tenant so this is cheap.
  const rows: any[] = projectId
    ? await (db as any).$queryRaw`
        SELECT
          id, "orgId", "projectId", "projectName",
          "boqItemId", "boqNo", "boqDescription", "boqQuantity", "boqUnit",
          phase, status, "totalQty", "totalCost", "materialCount", materials,
          "approvalId", "rejectionReason", "returnReason",
          "submittedAt", "submittedBy", "approvedAt", "approvedBy",
          "rejectedAt", "rejectedBy", "returnedAt", "returnedBy",
          "createdAt", "updatedAt", "createdBy", "updatedBy"
        FROM app_quikinfra."Material_estimations"
        WHERE "orgId" = ${orgId} AND "projectId" = ${projectId}
        ORDER BY "createdAt" DESC
      `
    : await (db as any).$queryRaw`
        SELECT
          id, "orgId", "projectId", "projectName",
          "boqItemId", "boqNo", "boqDescription", "boqQuantity", "boqUnit",
          phase, status, "totalQty", "totalCost", "materialCount", materials,
          "approvalId", "rejectionReason", "returnReason",
          "submittedAt", "submittedBy", "approvedAt", "approvedBy",
          "rejectedAt", "rejectedBy", "returnedAt", "returnedBy",
          "createdAt", "updatedAt", "createdBy", "updatedBy"
        FROM app_quikinfra."Material_estimations"
        WHERE "orgId" = ${orgId}
        ORDER BY "createdAt" DESC
      `;

  let mapped = rows.map(mapRow);
  if (allowed !== null) {
    const set = new Set(allowed);
    mapped = mapped.filter((r: any) => set.has(r.projectId));
  }
  if (search) {
    mapped = mapped.filter((r: any) =>
      [r.boqNo, r.boqDescription, r.phase, r.projectName].some(
        (v) => typeof v === "string" && v.toLowerCase().includes(search),
      ),
    );
  }
  return mapped;
}

export async function findEstimationById(
  orgId: string,
  id: string,
): Promise<any | null> {
  const rows: any[] = await (db as any).$queryRaw`
    SELECT
      id, "orgId", "projectId", "projectName",
      "boqItemId", "boqNo", "boqDescription", "boqQuantity", "boqUnit",
      phase, status, "totalQty", "totalCost", "materialCount", materials,
      "approvalId", "rejectionReason", "returnReason",
      "submittedAt", "submittedBy", "approvedAt", "approvedBy",
      "rejectedAt", "rejectedBy", "returnedAt", "returnedBy",
      "createdAt", "updatedAt", "createdBy", "updatedBy"
    FROM app_quikinfra."Material_estimations"
    WHERE "orgId" = ${orgId} AND id = ${id}
    LIMIT 1
  `;
  return rows.length ? mapRow(rows[0]) : null;
}

export async function createEstimation(
  input: CreateEstimationInput,
): Promise<any> {
  const id = genId();
  const { totalQty, totalCost, materialCount } = rollup(input.materials);
  const materialsJson = JSON.stringify(input.materials ?? []);
  const now = new Date();

  await (db as any).$executeRaw`
    INSERT INTO app_quikinfra."Material_estimations" (
      id, "orgId", "projectId", "projectName",
      "boqItemId", "boqNo", "boqDescription", "boqQuantity", "boqUnit",
      phase, status, "totalQty", "totalCost", "materialCount", materials,
      "createdAt", "updatedAt", "createdBy", "updatedBy"
    ) VALUES (
      ${id}, ${input.orgId}, ${input.projectId},
      ${input.projectName ?? null},
      ${input.boqItemId}, ${input.boqNo ?? null},
      ${input.boqDescription ?? null},
      ${input.boqQuantity != null ? String(input.boqQuantity) : null}::numeric,
      ${input.boqUnit ?? null},
      ${input.phase ?? "Foundation"},
      ${input.status ?? "draft"},
      ${String(totalQty)}::numeric,
      ${String(totalCost)}::numeric,
      ${materialCount},
      ${materialsJson}::jsonb,
      ${now}, ${now}, ${input.createdBy}, ${input.createdBy}
    )
  `;

  return (await findEstimationById(input.orgId, id))!;
}

export async function updateEstimation(
  id: string,
  input: UpdateEstimationInput,
): Promise<any | null> {
  const existing = await findEstimationById(input.orgId, id);
  if (!existing) return null;

  // Merge fields; only the caller-supplied ones overwrite. Rollup the
  // totals when materials change so list totals stay in sync.
  const next = { ...existing, ...stripUndefined(input) };
  const materialsChanged = Array.isArray(input.materials);
  const materials = materialsChanged ? input.materials! : existing.materials;
  const { totalQty, totalCost, materialCount } = materialsChanged
    ? rollup(materials)
    : {
        totalQty: existing.totalQty,
        totalCost: existing.totalCost,
        materialCount: existing.materialCount,
      };

  const now = new Date();

  await (db as any).$executeRaw`
    UPDATE app_quikinfra."Material_estimations"
    SET
      "projectName"    = ${next.projectName ?? null},
      "boqNo"          = ${next.boqNo ?? null},
      "boqDescription" = ${next.boqDescription ?? null},
      "boqQuantity"    = ${next.boqQuantity != null ? String(next.boqQuantity) : null}::numeric,
      "boqUnit"        = ${next.boqUnit ?? null},
      phase            = ${next.phase ?? null},
      status           = ${next.status ?? "draft"},
      "totalQty"       = ${String(totalQty)}::numeric,
      "totalCost"      = ${String(totalCost)}::numeric,
      "materialCount"  = ${materialCount},
      materials        = ${JSON.stringify(materials ?? [])}::jsonb,
      "updatedAt"      = ${now},
      "updatedBy"      = ${input.updatedBy}
    WHERE "orgId" = ${input.orgId} AND id = ${id}
  `;

  return findEstimationById(input.orgId, id);
}

function stripUndefined<T extends Record<string, any>>(o: T): Partial<T> {
  const out: any = {};
  for (const k in o) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

// Raw status patch — used by submit/approve routes that only need to
// flip status + audit columns without re-rolling the materials array.
// `cn_material_estimations` uses a JSONB blob for the composition, so
// flipping status without touching it is a cheap single-column update.
export async function patchEstimationStatus(
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
  const existing = await findEstimationById(orgId, id);
  if (!existing) return null;

  const next = {
    status: patch.status ?? existing.status,
    approvalId: patch.approvalId !== undefined ? patch.approvalId : existing.approvalId,
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
    UPDATE app_quikinfra."Material_estimations"
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

  return findEstimationById(orgId, id);
}

export async function deleteEstimation(
  orgId: string,
  id: string,
): Promise<boolean> {
  const res: any = await (db as any).$executeRaw`
    DELETE FROM app_quikinfra."Material_estimations"
    WHERE "orgId" = ${orgId} AND id = ${id}
  `;
  // Prisma's $executeRaw returns the affected row count on Postgres.
  return Number(res) > 0;
}
