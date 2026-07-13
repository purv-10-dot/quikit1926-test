/**
 * Locations master — Prisma-backed CRUD for `cn_locations`.
 *
 * Preserves the demo-store filter semantic: when a `projectId` is supplied
 * to `listLocations`, returns rows for that project PLUS rows with no
 * projectId (warehouses / head offices serving every project).
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";

export interface LocationRecord {
  id: string;
  orgId: string;
  code: string;
  name: string;
  type: string;
  projectId: string | null;
  projectName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  inCharge: string | null;
  capacity: string | null;
  itemGroupId: string | null;
  itemGroupName: string | null;
  itemIds: string[];
  itemQtyByItemId: Record<string, string> | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function toRecord(
  row: Prisma.CnLocationGetPayload<{
    include: {
      itemGroup: { select: { id: true; name: true } };
      project: { select: { id: true; name: true } };
    };
  }>,
): LocationRecord {
  const rawQty = row.itemQtyByItemId;
  const qty: Record<string, string> | null =
    rawQty && typeof rawQty === "object" && !Array.isArray(rawQty)
      ? Object.fromEntries(
          Object.entries(rawQty as Record<string, unknown>).map(([k, v]) => [
            k,
            v === null || v === undefined ? "" : String(v),
          ]),
        )
      : null;
  return {
    id: row.id,
    orgId: row.orgId,
    code: row.code,
    name: row.name,
    type: row.type,
    projectId: row.projectId ?? null,
    projectName: row.project?.name ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    inCharge: row.inCharge ?? null,
    capacity: row.capacity ?? null,
    itemGroupId: row.itemGroupId ?? null,
    itemGroupName: row.itemGroup?.name ?? null,
    itemIds: Array.isArray(row.itemIds) ? row.itemIds : [],
    itemQtyByItemId: qty,
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

function autoCode(seq: number): string {
  return `LOC-${String(seq).padStart(3, "0")}`;
}

export interface ListOptions {
  orgId: string;
  createdBy: string;
  search?: string;
  projectId?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildLocationsWhere(
  opts: Pick<ListOptions, "orgId" | "search" | "projectId">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  const projectFilter = opts.projectId
    ? { projectId: opts.projectId }
    : {};
  return {
    orgId: opts.orgId,
    // "deleted" rows are removed from the UI entirely; "inactive" rows are
    // still returned so they can show under the Inactive tab.
    status: { not: "deleted" },
    ...projectFilter,
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { type: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            { inCharge: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listLocations(opts: ListOptions): Promise<LocationRecord[]> {
  const rows = await db.cnLocation.findMany({
    where: buildLocationsWhere(opts),
    include: {
      itemGroup: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countLocations(
  opts: Pick<ListOptions, "orgId" | "search" | "projectId">,
): Promise<number> {
  return db.cnLocation.count({ where: buildLocationsWhere(opts) });
}

export async function findLocationById(orgId: string, id: string): Promise<LocationRecord | null> {
  const row = await db.cnLocation.findFirst({
    where: { id, orgId },
    include: {
      itemGroup: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
  });
  return row ? toRecord(row) : null;
}

export interface CreateLocationInput {
  orgId: string;
  createdBy: string;
  code?: string;
  name: string;
  type: string;
  projectId?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  inCharge?: string | null;
  capacity?: string | null;
  itemGroupId?: string | null;
  itemIds?: string[];
  itemQtyByItemId?: Record<string, string | number> | null;
  status?: string;
}

export async function createLocation(input: CreateLocationInput): Promise<LocationRecord> {
  let code = (input.code ?? "").trim();
  if (!code) {
    const count = await db.cnLocation.count({
      where: { orgId: input.orgId },
    });
    code = autoCode(count + 1);
  }
  const row = await db.cnLocation.create({
    data: {
      orgId: input.orgId,
      code,
      name: String(input.name).trim(),
      type: String(input.type).trim(),
      projectId: sOrNull(input.projectId),
      address: sOrNull(input.address),
      city: sOrNull(input.city),
      state: sOrNull(input.state),
      inCharge: sOrNull(input.inCharge),
      capacity: sOrNull(input.capacity),
      itemGroupId: sOrNull(input.itemGroupId),
      itemIds: Array.isArray(input.itemIds) ? input.itemIds.filter(Boolean) : [],
      itemQtyByItemId:
        input.itemQtyByItemId && typeof input.itemQtyByItemId === "object"
          ? (input.itemQtyByItemId as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
    include: {
      itemGroup: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
  });
  return toRecord(row);
}

export interface UpdateLocationInput
  extends Partial<Omit<CreateLocationInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateLocation(
  orgId: string,
  id: string,
  patch: UpdateLocationInput,
): Promise<LocationRecord | null> {
  const existing = await db.cnLocation.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.code !== undefined) data.code = String(patch.code).trim();
  if (patch.name !== undefined) data.name = String(patch.name).trim();
  if (patch.type !== undefined) data.type = String(patch.type).trim();
  if (patch.projectId !== undefined) data.projectId = sOrNull(patch.projectId);
  if (patch.address !== undefined) data.address = sOrNull(patch.address);
  if (patch.city !== undefined) data.city = sOrNull(patch.city);
  if (patch.state !== undefined) data.state = sOrNull(patch.state);
  if (patch.inCharge !== undefined) data.inCharge = sOrNull(patch.inCharge);
  if (patch.capacity !== undefined) data.capacity = sOrNull(patch.capacity);
  if (patch.itemGroupId !== undefined) data.itemGroupId = sOrNull(patch.itemGroupId);
  if (patch.itemIds !== undefined) {
    data.itemIds = Array.isArray(patch.itemIds) ? patch.itemIds.filter(Boolean) : [];
  }
  if (patch.itemQtyByItemId !== undefined) {
    data.itemQtyByItemId =
      patch.itemQtyByItemId && typeof patch.itemQtyByItemId === "object"
        ? patch.itemQtyByItemId
        : null;
  }
  if (patch.status !== undefined) data.status = patch.status;

  const row = await db.cnLocation.update({
    where: { id },
    data,
    include: {
      itemGroup: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
  });
  return toRecord(row);
}

export async function deleteLocation(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await db.cnLocation.updateMany({
    where: { id, orgId },
    data: { status: "deleted", updatedBy },
  });
  return res.count > 0;
}
