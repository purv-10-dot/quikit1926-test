/**
 * CRUD + mapping service for QcfLeadStatus / QcfLeadSubStatus.
 *
 * Storage: app_quikcrm.QcfLeadStatus / QcfLeadSubStatus / QcfLeadStatusSubStatus
 * (global lookup tables, not tenant-scoped — seeded once, shared by all tenants).
 */
import { prisma } from "@/lib/db/prisma";

// ─── Error ────────────────────────────────────────────────────────────────────

export class LeadStatusError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
    this.name = "LeadStatusError";
  }
}

// ─── DTO types ─────────────────────────────────────────────────────────────────

export interface LeadStatusDto {
  id: string;
  name: string;
  subStatuses: { id: string; name: string }[];
}

export interface LeadSubStatusDto {
  id: string;
  name: string;
  statuses: { id: string; name: string }[];
}

// ─── Prisma select shapes ─────────────────────────────────────────────────────

const STATUS_INCLUDE = {
  subStatuses: {
    include: {
      leadSubStatus: { select: { id: true, name: true } },
    },
  },
} as const;

const SUB_STATUS_INCLUDE = {
  statuses: {
    include: {
      leadStatus: { select: { id: true, name: true } },
    },
  },
} as const;

// ─── Mappers ──────────────────────────────────────────────────────────────────

type RawStatus = {
  id: string;
  name: string;
  subStatuses: { leadSubStatus: { id: string; name: string } }[];
};

type RawSubStatus = {
  id: string;
  name: string;
  statuses: { leadStatus: { id: string; name: string } }[];
};

function toStatusDto(row: RawStatus): LeadStatusDto {
  return {
    id: row.id,
    name: row.name,
    subStatuses: row.subStatuses
      .map((m) => m.leadSubStatus)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function toSubStatusDto(row: RawSubStatus): LeadSubStatusDto {
  return {
    id: row.id,
    name: row.name,
    statuses: row.statuses
      .map((m) => m.leadStatus)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ─── Lead Status ──────────────────────────────────────────────────────────────

export async function getLeadStatuses(): Promise<LeadStatusDto[]> {
  const rows = await prisma.qcfLeadStatus.findMany({
    include: STATUS_INCLUDE,
    orderBy: { name: "asc" },
  });
  return rows.map(toStatusDto);
}

export async function createLeadStatus(
  name: string,
  subStatusIds: string[] = [],
): Promise<LeadStatusDto> {
  const trimmed = name.trim();
  if (!trimmed) throw new LeadStatusError("Name is required");

  const existing = await prisma.qcfLeadStatus.findUnique({ where: { name: trimmed } });
  if (existing) throw new LeadStatusError(`Status "${trimmed}" already exists`, 409);

  const created = await prisma.qcfLeadStatus.create({
    data: {
      name: trimmed,
      subStatuses: subStatusIds.length
        ? { create: subStatusIds.map((leadSubStatusId) => ({ leadSubStatusId })) }
        : undefined,
    },
    include: STATUS_INCLUDE,
  });
  return toStatusDto(created);
}

export async function updateLeadStatus(
  id: string,
  data: { name?: string; subStatusIds?: string[] },
): Promise<LeadStatusDto> {
  const current = await prisma.qcfLeadStatus.findUnique({ where: { id } });
  if (!current) throw new LeadStatusError("Status not found", 404);

  if (data.name !== undefined) {
    const trimmed = data.name.trim();
    if (!trimmed) throw new LeadStatusError("Name is required");
    if (trimmed !== current.name) {
      const conflict = await prisma.qcfLeadStatus.findUnique({ where: { name: trimmed } });
      if (conflict) throw new LeadStatusError(`Status "${trimmed}" already exists`, 409);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    // Replace sub-status mappings when provided
    if (data.subStatusIds !== undefined) {
      await tx.qcfLeadStatusSubStatus.deleteMany({ where: { leadStatusId: id } });
      if (data.subStatusIds.length) {
        await tx.qcfLeadStatusSubStatus.createMany({
          data: data.subStatusIds.map((leadSubStatusId) => ({ leadStatusId: id, leadSubStatusId })),
          skipDuplicates: true,
        });
      }
    }

    // Rename if requested; otherwise just re-fetch with fresh relations
    if (data.name !== undefined) {
      return tx.qcfLeadStatus.update({
        where: { id },
        data: { name: data.name.trim() },
        include: STATUS_INCLUDE,
      });
    }
    return tx.qcfLeadStatus.findUniqueOrThrow({ where: { id }, include: STATUS_INCLUDE });
  });

  return toStatusDto(result);
}

export async function deleteLeadStatus(id: string): Promise<void> {
  const current = await prisma.qcfLeadStatus.findUnique({ where: { id } });
  if (!current) throw new LeadStatusError("Status not found", 404);
  // Junction rows cascade-delete via schema onDelete: Cascade
  await prisma.qcfLeadStatus.delete({ where: { id } });
}

// ─── Lead Sub-Status ──────────────────────────────────────────────────────────

export async function getLeadSubStatuses(): Promise<LeadSubStatusDto[]> {
  const rows = await prisma.qcfLeadSubStatus.findMany({
    include: SUB_STATUS_INCLUDE,
    orderBy: { name: "asc" },
  });
  return rows.map(toSubStatusDto);
}

export async function createLeadSubStatus(
  name: string,
  statusIds: string[] = [],
): Promise<LeadSubStatusDto> {
  const trimmed = name.trim();
  if (!trimmed) throw new LeadStatusError("Name is required");

  const existing = await prisma.qcfLeadSubStatus.findUnique({ where: { name: trimmed } });
  if (existing) throw new LeadStatusError(`Sub-status "${trimmed}" already exists`, 409);

  const created = await prisma.qcfLeadSubStatus.create({
    data: {
      name: trimmed,
      statuses: statusIds.length
        ? { create: statusIds.map((leadStatusId) => ({ leadStatusId })) }
        : undefined,
    },
    include: SUB_STATUS_INCLUDE,
  });
  return toSubStatusDto(created);
}

export async function updateLeadSubStatus(
  id: string,
  data: { name?: string; statusIds?: string[] },
): Promise<LeadSubStatusDto> {
  const current = await prisma.qcfLeadSubStatus.findUnique({ where: { id } });
  if (!current) throw new LeadStatusError("Sub-status not found", 404);

  if (data.name !== undefined) {
    const trimmed = data.name.trim();
    if (!trimmed) throw new LeadStatusError("Name is required");
    if (trimmed !== current.name) {
      const conflict = await prisma.qcfLeadSubStatus.findUnique({ where: { name: trimmed } });
      if (conflict) throw new LeadStatusError(`Sub-status "${trimmed}" already exists`, 409);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    // Replace status mappings when provided
    if (data.statusIds !== undefined) {
      await tx.qcfLeadStatusSubStatus.deleteMany({ where: { leadSubStatusId: id } });
      if (data.statusIds.length) {
        await tx.qcfLeadStatusSubStatus.createMany({
          data: data.statusIds.map((leadStatusId) => ({ leadStatusId, leadSubStatusId: id })),
          skipDuplicates: true,
        });
      }
    }

    if (data.name !== undefined) {
      return tx.qcfLeadSubStatus.update({
        where: { id },
        data: { name: data.name.trim() },
        include: SUB_STATUS_INCLUDE,
      });
    }
    return tx.qcfLeadSubStatus.findUniqueOrThrow({ where: { id }, include: SUB_STATUS_INCLUDE });
  });

  return toSubStatusDto(result);
}

export async function deleteLeadSubStatus(id: string): Promise<void> {
  const current = await prisma.qcfLeadSubStatus.findUnique({ where: { id } });
  if (!current) throw new LeadStatusError("Sub-status not found", 404);
  await prisma.qcfLeadSubStatus.delete({ where: { id } });
}
