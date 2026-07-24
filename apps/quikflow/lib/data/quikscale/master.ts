/**
 * QuikScale master-data readers (doc §6.2). Each returns the standard
 * `{ items:[{id,label,sublabel,meta}], total }` envelope, always org-scoped.
 * These feed the builder's people/reference pickers with live org data.
 */
import { db } from "@/lib/db";
import type { MasterItem, MasterResult, MasterTable } from "../types";

async function users(orgId: string): Promise<MasterItem[]> {
  const rows = await db.orgMember.findMany({
    where: { orgId, status: "active" },
    select: {
      userId: true,
      role: true,
      teamId: true,
      user: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { user: { firstName: "asc" } },
  });
  return rows.map((r) => ({
    id: r.userId,
    label: `${r.user.firstName} ${r.user.lastName}`.trim() || r.user.email,
    sublabel: r.user.email,
    meta: { role: r.role, teamId: r.teamId },
  }));
}

async function teams(orgId: string): Promise<MasterItem[]> {
  const rows = await db.qsTeam.findMany({
    where: { orgId, deletedAt: null },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, label: r.name, sublabel: r.slug }));
}

async function categories(orgId: string): Promise<MasterItem[]> {
  const rows = await db.categoryMaster.findMany({
    where: { orgId, deletedAt: null },
    select: { id: true, name: true, dataType: true, categoryType: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.name,
    meta: { dataType: r.dataType, categoryType: r.categoryType },
  }));
}

async function units(orgId: string): Promise<MasterItem[]> {
  const rows = await db.unitMaster.findMany({
    where: { orgId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => ({ id: r.id, label: r.name }));
}

async function quarters(orgId: string): Promise<MasterItem[]> {
  const rows = await db.quarterSetting.findMany({
    where: { orgId },
    select: { id: true, quarter: true, fiscalYear: true, startDate: true, endDate: true, weekCount: true, status: true },
    orderBy: [{ fiscalYear: "desc" }, { quarter: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    label: `${r.quarter} FY${r.fiscalYear}`,
    sublabel: r.status,
    meta: {
      quarter: r.quarter,
      fiscalYear: r.fiscalYear,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
      weekCount: r.weekCount,
    },
  }));
}

const READERS: Record<MasterTable, (orgId: string) => Promise<MasterItem[]>> = {
  users,
  teams,
  categories,
  units,
  quarters,
};

export async function listMaster(orgId: string, table: MasterTable): Promise<MasterResult> {
  const items = await READERS[table](orgId);
  return { items, total: items.length };
}
