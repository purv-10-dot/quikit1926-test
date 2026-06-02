/**
 * Projects master — Prisma-backed CRUD for `cn_projects`.
 */

import { db } from "@/lib/db/prisma";

export interface ProjectRecord {
  id: string;
  orgId: string;
  code: string;
  name: string;
  description: string;
  projectType: string;
  companyId: string;
  companyName: string;
  clientId: string | null;
  clientName: string;
  departmentId: string | null;
  address: string;
  city: string;
  state: string;
  pincode: string;
  siteGstin: string;
  startDate: string;
  expectedEndDate: string;
  actualEndDate: string;
  projectValue: string;
  budget: string;
  purchaseLimit: string;
  projectManagerId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function isoDate(d: Date | null | undefined): string {
  if (!d) return "";
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function toRecord(row: any): ProjectRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    code: row.code ?? "",
    name: row.name ?? "",
    description: row.description ?? "",
    projectType: row.projectType ?? "",
    companyId: row.companyId,
    companyName: row.company?.name ?? "",
    clientId: row.clientId ?? null,
    clientName: row.client?.name ?? "",
    departmentId: row.departmentId ?? null,
    address: row.address ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    pincode: row.pincode ?? "",
    siteGstin: row.siteGstin ?? "",
    startDate: isoDate(row.startDate),
    expectedEndDate: isoDate(row.expectedEndDate),
    actualEndDate: isoDate(row.actualEndDate),
    projectValue:
      row.projectValue !== null && row.projectValue !== undefined
        ? String(row.projectValue)
        : "",
    budget:
      row.budget !== null && row.budget !== undefined ? String(row.budget) : "",
    purchaseLimit:
      row.purchaseLimit !== null && row.purchaseLimit !== undefined
        ? String(row.purchaseLimit)
        : "",
    projectManagerId: row.projectManagerId ?? null,
    status: row.status ?? "active",
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function parseDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface ListProjectsOptions {
  orgId: string;
  search?: string;
  includeInactive?: boolean;
  projectIds?: string[];
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildProjectsWhere(
  opts: Pick<
    ListProjectsOptions,
    "orgId" | "search" | "includeInactive" | "projectIds"
  >,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  const restrictToIds = Array.isArray(opts.projectIds);
  return {
    orgId: opts.orgId,
    ...(restrictToIds ? { id: { in: opts.projectIds } } : {}),
    ...(opts.includeInactive ? {} : { status: { not: "inactive" } }),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            { state: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listProjects(
  opts: ListProjectsOptions,
): Promise<ProjectRecord[]> {
  const rows = await (db as any).cnProject.findMany({
    where: buildProjectsWhere(opts),
    include: { company: true, client: true },
    orderBy: { createdAt: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countProjects(
  opts: Pick<
    ListProjectsOptions,
    "orgId" | "search" | "includeInactive" | "projectIds"
  >,
): Promise<number> {
  return (db as any).cnProject.count({ where: buildProjectsWhere(opts) });
}

export async function findProjectById(
  orgId: string,
  id: string,
): Promise<ProjectRecord | null> {
  const row = await (db as any).cnProject.findFirst({
    where: { id, orgId },
    include: { company: true, client: true },
  });
  return row ? toRecord(row) : null;
}

export interface CreateProjectInput {
  orgId: string;
  createdBy: string;
  code: string;
  name: string;
  description?: string;
  projectType?: string | null;
  companyId: string;
  clientId?: string | null;
  departmentId?: string | null;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string | null;
  siteGstin?: string | null;
  startDate?: string | null;
  expectedEndDate?: string | null;
  actualEndDate?: string | null;
  projectValue?: string | number | null;
  budget?: string | number | null;
  purchaseLimit?: string | number | null;
  projectManagerId?: string | null;
  status?: string;
}

export async function createProject(
  input: CreateProjectInput,
): Promise<ProjectRecord> {
  const row = await (db as any).cnProject.create({
    data: {
      orgId: input.orgId,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      description: input.description ?? null,
      projectType: input.projectType ?? null,
      companyId: input.companyId,
      clientId: input.clientId ?? null,
      departmentId: input.departmentId ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      pincode: input.pincode ?? null,
      siteGstin: input.siteGstin ? String(input.siteGstin).toUpperCase().trim() : null,
      startDate: parseDate(input.startDate),
      expectedEndDate: parseDate(input.expectedEndDate),
      actualEndDate: parseDate(input.actualEndDate),
      projectValue:
        input.projectValue !== null && input.projectValue !== undefined && input.projectValue !== ""
          ? String(input.projectValue)
          : null,
      budget:
        input.budget !== null && input.budget !== undefined && input.budget !== ""
          ? String(input.budget)
          : null,
      purchaseLimit:
        input.purchaseLimit !== null && input.purchaseLimit !== undefined && input.purchaseLimit !== ""
          ? String(input.purchaseLimit)
          : null,
      projectManagerId: input.projectManagerId ?? null,
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
    include: { company: true, client: true },
  });
  return toRecord(row);
}

export interface UpdateProjectInput
  extends Partial<Omit<CreateProjectInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateProject(
  orgId: string,
  id: string,
  patch: UpdateProjectInput,
): Promise<ProjectRecord | null> {
  const existing = await (db as any).cnProject.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.code !== undefined) data.code = patch.code.trim().toUpperCase();
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.description !== undefined) data.description = patch.description || null;
  if (patch.projectType !== undefined) data.projectType = patch.projectType || null;
  if (patch.companyId !== undefined) data.companyId = patch.companyId;
  if (patch.clientId !== undefined) data.clientId = patch.clientId || null;
  if (patch.departmentId !== undefined) data.departmentId = patch.departmentId || null;
  if (patch.address !== undefined) data.address = patch.address || null;
  if (patch.city !== undefined) data.city = patch.city || null;
  if (patch.state !== undefined) data.state = patch.state || null;
  if (patch.pincode !== undefined) data.pincode = patch.pincode || null;
  if (patch.siteGstin !== undefined) {
    data.siteGstin = patch.siteGstin ? String(patch.siteGstin).toUpperCase().trim() : null;
  }
  if (patch.startDate !== undefined) data.startDate = parseDate(patch.startDate);
  if (patch.expectedEndDate !== undefined)
    data.expectedEndDate = parseDate(patch.expectedEndDate);
  if (patch.actualEndDate !== undefined)
    data.actualEndDate = parseDate(patch.actualEndDate);
  if (patch.projectValue !== undefined) {
    data.projectValue =
      patch.projectValue !== null && patch.projectValue !== ""
        ? String(patch.projectValue)
        : null;
  }
  if (patch.budget !== undefined) {
    data.budget = patch.budget !== null && patch.budget !== "" ? String(patch.budget) : null;
  }
  if (patch.purchaseLimit !== undefined) {
    data.purchaseLimit =
      patch.purchaseLimit !== null && patch.purchaseLimit !== ""
        ? String(patch.purchaseLimit)
        : null;
  }
  if (patch.projectManagerId !== undefined)
    data.projectManagerId = patch.projectManagerId || null;
  if (patch.status !== undefined) data.status = patch.status;

  const row = await (db as any).cnProject.update({
    where: { id },
    data,
    include: { company: true, client: true },
  });
  return toRecord(row);
}

export async function deleteProject(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await (db as any).cnProject.updateMany({
    where: { id, orgId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
