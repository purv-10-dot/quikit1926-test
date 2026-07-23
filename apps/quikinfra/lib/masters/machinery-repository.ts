/**
 * Machinery master — Prisma-backed CRUD for `cn_machinery`.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";

export interface MachineryRecord {
  id: string;
  orgId: string;
  code: string;
  name: string;
  type: string;
  make: string | null;
  model: string | null;
  registrationNo: string | null;
  projectId: string | null;
  projectName: string | null;
  locationId: string | null;
  fuelType: string | null;
  capacity: string | null;
  meterType: string;
  currentMeter: number | null;
  fuelNorm: number | null;
  serviceIntervalValue: number | null;
  serviceIntervalUnit: string | null;
  ownershipType: string;
  capitalisationCost: number | null;
  deprMethod: string | null;
  deprRate: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function toRecord(row: Prisma.CnMachineryGetPayload<Record<string, never>> & { project?: { id: string; name: string } | null }): MachineryRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    code: row.code,
    name: row.name,
    type: row.type,
    make: row.make ?? null,
    model: row.model ?? null,
    registrationNo: row.registrationNo ?? null,
    projectId: row.projectId ?? null,
    projectName: row.project?.name ?? null,
    locationId: row.locationId ?? null,
    fuelType: row.fuelType ?? null,
    capacity: row.capacity ?? null,
    meterType: row.meterType ?? "hour",
    currentMeter: row.currentMeter != null ? Number(row.currentMeter) : null,
    fuelNorm: row.fuelNorm != null ? Number(row.fuelNorm) : null,
    serviceIntervalValue: row.serviceIntervalValue != null ? Number(row.serviceIntervalValue) : null,
    serviceIntervalUnit: row.serviceIntervalUnit ?? null,
    ownershipType: row.ownershipType ?? "owned",
    capitalisationCost: row.capitalisationCost != null ? Number(row.capitalisationCost) : null,
    deprMethod: row.deprMethod ?? null,
    deprRate: row.deprRate != null ? Number(row.deprRate) : null,
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

function nOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function autoCode(type: string, seq: number): string {
  const prefix = (type || "MACH").replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "MACH";
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}

export interface ListOptions {
  orgId: string;
  createdBy: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
  /** Status view. Omit for legacy picker behavior (all non-deleted). */
  status?: "active" | "inactive" | "all";
  /** Server-side sort (from `parseSort`). Defaults to newest-first. */
  orderBy?: Array<Record<string, "asc" | "desc">>;
}

function buildMachineryWhere(
  opts: Pick<ListOptions, "orgId" | "search" | "status">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    // "deleted" rows are removed from the UI entirely; "inactive" rows are
    // still returned so they can show under the Inactive tab.
    ...(opts.status === "inactive"
      ? { status: "inactive" }
      : opts.status === "active"
        ? { status: { notIn: ["inactive", "deleted"] } }
        : { status: { not: "deleted" } }),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { type: { contains: q, mode: "insensitive" } },
            { make: { contains: q, mode: "insensitive" } },
            { registrationNo: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listMachinery(opts: ListOptions): Promise<MachineryRecord[]> {
  const rows = await db.cnMachinery.findMany({
    where: buildMachineryWhere(opts),
    include: { project: { select: { id: true, name: true } } },
    orderBy: opts.orderBy ?? { createdAt: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countMachinery(
  opts: Pick<ListOptions, "orgId" | "search" | "status">,
): Promise<number> {
  return db.cnMachinery.count({ where: buildMachineryWhere(opts) });
}

export async function findMachineryById(orgId: string, id: string): Promise<MachineryRecord | null> {
  const row = await db.cnMachinery.findFirst({ where: { id, orgId } });
  return row ? toRecord(row) : null;
}

export interface CreateMachineryInput {
  orgId: string;
  createdBy: string;
  code?: string;
  name: string;
  type: string;
  make?: string | null;
  model?: string | null;
  registrationNo?: string | null;
  projectId?: string | null;
  locationId?: string | null;
  fuelType?: string | null;
  capacity?: string | null;
  meterType?: string | null;
  currentMeter?: number | string | null;
  fuelNorm?: number | string | null;
  serviceIntervalValue?: number | string | null;
  serviceIntervalUnit?: string | null;
  ownershipType?: string | null;
  capitalisationCost?: number | string | null;
  deprMethod?: string | null;
  deprRate?: number | string | null;
  status?: string;
}

export async function createMachinery(input: CreateMachineryInput): Promise<MachineryRecord> {
  let code = (input.code ?? "").trim();
  if (!code) {
    const count = await db.cnMachinery.count({
      where: { orgId: input.orgId },
    });
    code = autoCode(input.type, count + 1);
  }
  const row = await db.cnMachinery.create({
    data: {
      orgId: input.orgId,
      code,
      name: String(input.name).trim(),
      type: String(input.type).trim(),
      make: sOrNull(input.make),
      model: sOrNull(input.model),
      registrationNo: input.registrationNo ? String(input.registrationNo).toUpperCase().trim() : null,
      projectId: sOrNull(input.projectId),
      locationId: sOrNull(input.locationId),
      fuelType: sOrNull(input.fuelType),
      capacity: sOrNull(input.capacity),
      meterType: sOrNull(input.meterType) ?? "hour",
      currentMeter: nOrNull(input.currentMeter),
      fuelNorm: nOrNull(input.fuelNorm),
      serviceIntervalValue: nOrNull(input.serviceIntervalValue),
      serviceIntervalUnit: sOrNull(input.serviceIntervalUnit),
      ownershipType: sOrNull(input.ownershipType) ?? "owned",
      capitalisationCost: nOrNull(input.capitalisationCost),
      deprMethod: sOrNull(input.deprMethod),
      deprRate: nOrNull(input.deprRate),
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
  return toRecord(row);
}

export interface UpdateMachineryInput
  extends Partial<Omit<CreateMachineryInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateMachinery(
  orgId: string,
  id: string,
  patch: UpdateMachineryInput,
): Promise<MachineryRecord | null> {
  const existing = await db.cnMachinery.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.code !== undefined) data.code = String(patch.code).trim();
  if (patch.name !== undefined) data.name = String(patch.name).trim();
  if (patch.type !== undefined) data.type = String(patch.type).trim();
  if (patch.make !== undefined) data.make = sOrNull(patch.make);
  if (patch.model !== undefined) data.model = sOrNull(patch.model);
  if (patch.registrationNo !== undefined) {
    data.registrationNo = patch.registrationNo
      ? String(patch.registrationNo).toUpperCase().trim()
      : null;
  }
  if (patch.projectId !== undefined) data.projectId = sOrNull(patch.projectId);
  if (patch.locationId !== undefined) data.locationId = sOrNull(patch.locationId);
  if (patch.fuelType !== undefined) data.fuelType = sOrNull(patch.fuelType);
  if (patch.capacity !== undefined) data.capacity = sOrNull(patch.capacity);
  if (patch.meterType !== undefined) data.meterType = sOrNull(patch.meterType) ?? "hour";
  if (patch.currentMeter !== undefined) data.currentMeter = nOrNull(patch.currentMeter);
  if (patch.fuelNorm !== undefined) data.fuelNorm = nOrNull(patch.fuelNorm);
  if (patch.serviceIntervalValue !== undefined) data.serviceIntervalValue = nOrNull(patch.serviceIntervalValue);
  if (patch.serviceIntervalUnit !== undefined) data.serviceIntervalUnit = sOrNull(patch.serviceIntervalUnit);
  if (patch.ownershipType !== undefined) data.ownershipType = sOrNull(patch.ownershipType) ?? "owned";
  if (patch.capitalisationCost !== undefined) data.capitalisationCost = nOrNull(patch.capitalisationCost);
  if (patch.deprMethod !== undefined) data.deprMethod = sOrNull(patch.deprMethod);
  if (patch.deprRate !== undefined) data.deprRate = nOrNull(patch.deprRate);
  if (patch.status !== undefined) data.status = patch.status;

  const row = await db.cnMachinery.update({ where: { id }, data });
  return toRecord(row);
}

export async function deleteMachinery(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await db.cnMachinery.updateMany({
    where: { id, orgId },
    data: { status: "deleted", updatedBy },
  });
  return res.count > 0;
}
