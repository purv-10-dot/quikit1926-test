/**
 * Equipment deployment — inter-site transfers + compliance documents (unified table).
 */

import { db } from "@/lib/db";
import { paginateInMemory, type PaginationParams } from "@/lib/http/pagination";
import { Prisma } from "@quikit/database";
import { deriveDocComplianceState } from "@/lib/equipment/equipment-calculations";
import {
  DEPLOY_DOCUMENT,
  DEPLOY_TRANSFER,
} from "@/lib/equipment/equipment-record-types";
import type {
  DeploymentSummary,
  EquipmentDocumentRecord,
  EquipmentTransferRecord,
  TransferStatus,
  TransferType,
} from "@/lib/equipment/equipment-types";

export type {
  DeploymentSummary,
  EquipmentDocumentRecord,
  EquipmentTransferRecord,
};

async function nextTransferNumber(orgId: string): Promise<string> {
  const count = await db.cnEquipmentDeployment.count({
    where: { orgId, recordType: DEPLOY_TRANSFER },
  });
  return `EQT-${String(count + 1).padStart(4, "0")}`;
}

const transferInclude = {
  equipment: { select: { code: true, name: true } },
  sourceProject: { select: { name: true } },
  destinationProject: { select: { name: true } },
} as const;

function toTransferRecord(
  row: Prisma.CnEquipmentDeploymentGetPayload<{ include: typeof transferInclude }>,
): EquipmentTransferRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    transferNumber: row.referenceNumber ?? row.id,
    equipmentId: row.equipmentId,
    equipmentCode: row.equipment?.code ?? "",
    equipmentName: row.equipment?.name ?? "",
    sourceProjectId: row.sourceProjectId,
    sourceProjectName: row.sourceProject?.name ?? null,
    destinationProjectId: row.destinationProjectId ?? "",
    destinationProjectName: row.destinationProject?.name ?? "",
    transferType: (row.transferType ?? "reassignment") as TransferType,
    transferDate: row.transferDate?.toISOString().slice(0, 10) ?? "",
    returnableFrom: row.returnableFrom?.toISOString().slice(0, 10) ?? null,
    returnableTo: row.returnableTo?.toISOString().slice(0, 10) ?? null,
    reason: row.reason,
    remarks: row.remarks,
    gatePassNo: row.gatePassNo,
    status: row.status as TransferStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

const docInclude = {
  equipment: { select: { code: true, name: true } },
} as const;

function toDocumentRecord(
  row: Prisma.CnEquipmentDeploymentGetPayload<{ include: typeof docInclude }>,
): EquipmentDocumentRecord {
  const derived = deriveDocComplianceState(
    row.expiryDate?.toISOString?.().slice(0, 10) ?? null,
    row.alertDays ?? 30,
  );
  return {
    id: row.id,
    orgId: row.orgId,
    equipmentId: row.equipmentId,
    equipmentCode: row.equipment?.code ?? "",
    equipmentName: row.equipment?.name ?? "",
    docType: row.docType ?? "",
    docNumber: row.docNumber,
    issueDate: row.issueDate?.toISOString?.().slice(0, 10) ?? null,
    expiryDate: row.expiryDate?.toISOString?.().slice(0, 10) ?? null,
    alertDays: row.alertDays ?? 30,
    fileUrl: row.fileUrl,
    status: row.status,
    daysUntilExpiry: derived.days,
    complianceState: derived.state,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export interface ListTransfersOptions {
  orgId: string;
  status?: string;
  projectIds?: string[];
  search?: string;
  orderBy?: Prisma.CnEquipmentDeploymentOrderByWithRelationInput[];
  take?: number;
  skip?: number;
}

export async function listTransfers(opts: ListTransfersOptions) {
  const where: Prisma.CnEquipmentDeploymentWhereInput = {
    orgId: opts.orgId,
    recordType: DEPLOY_TRANSFER,
  };
  if (opts.status && opts.status !== "all") where.status = opts.status;
  const and: Prisma.CnEquipmentDeploymentWhereInput[] = [];
  if (Array.isArray(opts.projectIds) && opts.projectIds.length > 0) {
    and.push({
      OR: [
        { sourceProjectId: { in: opts.projectIds } },
        { destinationProjectId: { in: opts.projectIds } },
      ],
    });
  }
  const search = opts.search?.trim();
  if (search) {
    and.push({
      OR: [
        { referenceNumber: { contains: search, mode: "insensitive" } },
        { gatePassNo: { contains: search, mode: "insensitive" } },
        { reason: { contains: search, mode: "insensitive" } },
        { remarks: { contains: search, mode: "insensitive" } },
        { equipment: { code: { contains: search, mode: "insensitive" } } },
        { equipment: { name: { contains: search, mode: "insensitive" } } },
      ],
    });
  }
  if (and.length > 0) where.AND = and;
  const [rows, total] = await Promise.all([
    db.cnEquipmentDeployment.findMany({
      where,
      include: transferInclude,
      orderBy: opts.orderBy ?? [{ transferDate: "desc" }, { createdAt: "desc" }],
      ...(opts.take != null ? { take: opts.take, skip: opts.skip ?? 0 } : {}),
    }),
    db.cnEquipmentDeployment.count({ where }),
  ]);
  return { data: rows.map(toTransferRecord), total };
}

export interface CreateTransferInput {
  orgId: string;
  userId: string;
  equipmentId: string;
  destinationProjectId: string;
  transferType?: TransferType;
  transferDate: string;
  returnableFrom?: string | null;
  returnableTo?: string | null;
  reason?: string | null;
  remarks?: string | null;
}

export async function createTransfer(input: CreateTransferInput) {
  const equipment = await db.cnMachinery.findFirst({
    where: { id: input.equipmentId, orgId: input.orgId },
    select: { id: true, projectId: true },
  });
  if (!equipment) throw new Error("EQUIPMENT_NOT_FOUND");

  if (equipment.projectId === input.destinationProjectId) {
    throw new Error("SAME_DESTINATION");
  }

  const openTransfer = await db.cnEquipmentDeployment.findFirst({
    where: {
      orgId: input.orgId,
      recordType: DEPLOY_TRANSFER,
      equipmentId: input.equipmentId,
      status: "in_transit",
    },
    select: { id: true },
  });
  if (openTransfer) throw new Error("OPEN_TRANSFER_EXISTS");

  const referenceNumber = await nextTransferNumber(input.orgId);
  const gatePassNo = `GP-${referenceNumber}`;

  const created = await db.cnEquipmentDeployment.create({
    data: {
      orgId: input.orgId,
      recordType: DEPLOY_TRANSFER,
      referenceNumber,
      equipmentId: input.equipmentId,
      sourceProjectId: equipment.projectId,
      destinationProjectId: input.destinationProjectId,
      transferType: input.transferType ?? "reassignment",
      transferDate: new Date(input.transferDate),
      returnableFrom: input.returnableFrom ? new Date(input.returnableFrom) : null,
      returnableTo: input.returnableTo ? new Date(input.returnableTo) : null,
      reason: input.reason ?? null,
      remarks: input.remarks ?? null,
      gatePassNo,
      status: "in_transit",
      createdBy: input.userId,
      updatedBy: input.userId,
    },
    include: transferInclude,
  });

  return toTransferRecord(created);
}

export async function getTransferById(orgId: string, id: string) {
  const row = await db.cnEquipmentDeployment.findFirst({
    where: { id, orgId, recordType: DEPLOY_TRANSFER },
    include: transferInclude,
  });
  return row ? toTransferRecord(row) : null;
}

export async function patchTransfer(input: {
  orgId: string;
  userId: string;
  id: string;
  action: "receive" | "cancel";
}) {
  const existing = await db.cnEquipmentDeployment.findFirst({
    where: { id: input.id, orgId: input.orgId, recordType: DEPLOY_TRANSFER },
    select: {
      id: true,
      equipmentId: true,
      destinationProjectId: true,
      status: true,
    },
  });
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.status !== "in_transit") throw new Error("INVALID_STATUS");

  if (input.action === "cancel") {
    const updated = await db.cnEquipmentDeployment.update({
      where: { id: input.id },
      data: { status: "cancelled", updatedBy: input.userId },
      include: transferInclude,
    });
    return toTransferRecord(updated);
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.cnEquipmentDeployment.update({
      where: { id: input.id },
      data: { status: "received", updatedBy: input.userId },
      include: transferInclude,
    });
    await tx.cnMachinery.update({
      where: { id: existing.equipmentId },
      data: {
        projectId: existing.destinationProjectId,
        updatedBy: input.userId,
      },
    });
    return row;
  });

  return toTransferRecord(updated);
}

export interface ListDocumentsOptions {
  orgId: string;
  equipmentId?: string;
  projectIds?: string[];
  pagination?: PaginationParams;
}

export async function listDocuments(opts: ListDocumentsOptions) {
  const where: Prisma.CnEquipmentDeploymentWhereInput = {
    orgId: opts.orgId,
    recordType: DEPLOY_DOCUMENT,
    status: "active",
  };
  if (opts.equipmentId) where.equipmentId = opts.equipmentId;

  const rows = await db.cnEquipmentDeployment.findMany({
    where,
    include: docInclude,
    orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }],
  });

  let data = rows.map(toDocumentRecord);
  if (Array.isArray(opts.projectIds) && opts.projectIds.length > 0) {
    const equipmentIds = new Set(
      (
        await db.cnMachinery.findMany({
          where: { orgId: opts.orgId, projectId: { in: opts.projectIds } },
          select: { id: true },
        })
      ).map((m) => m.id),
    );
    data = data.filter((d) => equipmentIds.has(d.equipmentId));
  }

  return opts.pagination ? paginateInMemory(data, opts.pagination) : { data, total: data.length };
}

export interface CreateDocumentInput {
  orgId: string;
  userId: string;
  equipmentId: string;
  docType: string;
  docNumber?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  alertDays?: number;
  fileUrl?: string | null;
}

export async function createDocument(input: CreateDocumentInput) {
  const equipment = await db.cnMachinery.findFirst({
    where: { id: input.equipmentId, orgId: input.orgId },
    select: { id: true },
  });
  if (!equipment) throw new Error("EQUIPMENT_NOT_FOUND");

  const docNumber = input.docNumber ?? null;
  const created = await db.cnEquipmentDeployment.create({
    data: {
      orgId: input.orgId,
      recordType: DEPLOY_DOCUMENT,
      referenceNumber: docNumber ?? `DOC-${Date.now()}`,
      equipmentId: input.equipmentId,
      docType: input.docType,
      docNumber,
      issueDate: input.issueDate ? new Date(input.issueDate) : null,
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
      alertDays: input.alertDays ?? 30,
      fileUrl: input.fileUrl ?? null,
      status: "active",
      createdBy: input.userId,
      updatedBy: input.userId,
    },
    include: docInclude,
  });

  return toDocumentRecord(created);
}

export async function deactivateDocument(
  orgId: string,
  id: string,
  userId: string,
) {
  const existing = await db.cnEquipmentDeployment.findFirst({
    where: { id, orgId, recordType: DEPLOY_DOCUMENT, status: "active" },
    select: { id: true },
  });
  if (!existing) throw new Error("NOT_FOUND");

  const updated = await db.cnEquipmentDeployment.update({
    where: { id },
    data: { status: "inactive", updatedBy: userId },
    include: docInclude,
  });
  return toDocumentRecord(updated);
}

export async function getDeploymentSummary(opts: {
  orgId: string;
  projectIds?: string[];
}): Promise<DeploymentSummary> {
  const transferWhere: Prisma.CnEquipmentDeploymentWhereInput = {
    orgId: opts.orgId,
    recordType: DEPLOY_TRANSFER,
    status: "in_transit",
  };
  if (Array.isArray(opts.projectIds) && opts.projectIds.length > 0) {
    transferWhere.OR = [
      { sourceProjectId: { in: opts.projectIds } },
      { destinationProjectId: { in: opts.projectIds } },
    ];
  }

  const [inTransit, docs] = await Promise.all([
    db.cnEquipmentDeployment.count({ where: transferWhere }),
    listDocuments({ orgId: opts.orgId, projectIds: opts.projectIds }),
  ]);

  let docsExpired = 0;
  let docsExpiring = 0;
  for (const doc of docs.data) {
    if (doc.complianceState === "expired") docsExpired += 1;
    if (doc.complianceState === "expiring") docsExpiring += 1;
  }

  return { inTransit, docsExpired, docsExpiring };
}
