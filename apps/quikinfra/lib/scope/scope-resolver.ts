/**
 * Scope Resolver — the single seam that lets downstream modules (estimation,
 * work order, DPR, RAB, billing) treat a "scope line" uniformly regardless of
 * the project's execution mode.
 *
 *   BOQ mode        → scope lines come from CnBOQItemV2 leaves (priced baseline)
 *   FREE_SCOPE mode → scope lines come from CnActivityItem leaves (no baseline)
 *
 * Only leaves are anchorable; folders (isGroup = true) are grouping-only.
 */

import type { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { ScopeError } from "./free-scope";

export type ExecutionMode = "BOQ" | "FREE_SCOPE";
export type ScopeType = "BOQ" | "ACTIVITY";

/** Unified shape every downstream module reads, whatever the mode. */
export interface ScopeLine {
  scopeType: ScopeType;
  scopeId: string;
  code: string;
  description: string;
  workCategoryId: string | null;
  uomId: string | null;
  plannedQty: number | null;
  baselineRate: number | null;
  /** true for BOQ (contracted qty + rate), false for FREE_SCOPE. */
  hasContractBaseline: boolean;
}

function toNum(d: Prisma.Decimal | null): number | null {
  return d === null ? null : Number(d.toString());
}

type ActivityRow = {
  id: string;
  activityCode: string;
  description: string;
  category: string | null;
  uomId: string | null;
  tenderQty: Prisma.Decimal | null;
  rate: Prisma.Decimal | null;
  isGroup: boolean;
};

type BoqRow = {
  id: string;
  boqNo: string;
  description: string;
  displayName: string;
  unit: string | null;
  tenderQty: Prisma.Decimal | null;
  rate: Prisma.Decimal | null;
  isGroup: boolean;
};

function activityToScopeLine(a: ActivityRow): ScopeLine {
  return {
    scopeType: "ACTIVITY",
    scopeId: a.id,
    code: a.activityCode,
    description: a.description,
    workCategoryId: null,
    uomId: a.uomId,
    plannedQty: toNum(a.tenderQty),
    baselineRate: toNum(a.rate),
    hasContractBaseline: false,
  };
}

function boqToScopeLine(b: BoqRow): ScopeLine {
  return {
    scopeType: "BOQ",
    scopeId: b.id,
    code: b.boqNo,
    description: b.description || b.displayName,
    workCategoryId: null,
    uomId: null,
    plannedQty: toNum(b.tenderQty),
    baselineRate: toNum(b.rate),
    hasContractBaseline: true,
  };
}

/**
 * Reads CnProject.executionMode. Defaults to "BOQ" for legacy rows / unknown
 * values so every pre-existing project behaves exactly as before.
 */
export async function getProjectMode(
  orgId: string,
  projectId: string
): Promise<ExecutionMode> {
  const project = await db.cnProject.findFirst({
    where: { id: projectId, orgId },
    select: { executionMode: true },
  });
  return project?.executionMode === "FREE_SCOPE" ? "FREE_SCOPE" : "BOQ";
}

/**
 * Returns the anchorable scope lines (leaves only) for a project, resolved
 * against its execution mode.
 */
export async function getScopeLines(
  orgId: string,
  projectId: string
): Promise<ScopeLine[]> {
  const mode = await getProjectMode(orgId, projectId);

  if (mode === "FREE_SCOPE") {
    const rows = await db.cnActivityItem.findMany({
      where: { orgId, projectId, isGroup: false, status: "active" },
      orderBy: [{ depth: "asc" }, { sortOrder: "asc" }],
    });
    return rows.map(activityToScopeLine);
  }

  const rows = await db.cnBOQItemV2.findMany({
    where: { orgId, projectId, isGroup: false, deletedAt: null },
    orderBy: [{ depth: "asc" }, { sortOrder: "asc" }],
  });
  return rows.map(boqToScopeLine);
}

/**
 * Resolves a single scope line by (scopeType, scopeId), org- and
 * project-scoped. Returns null when the reference is unknown.
 */
export async function resolveScope(
  orgId: string,
  projectId: string,
  scopeType: ScopeType,
  scopeId: string
): Promise<ScopeLine | null> {
  if (scopeType === "ACTIVITY") {
    const row = await db.cnActivityItem.findFirst({
      where: { id: scopeId, orgId, projectId },
    });
    return row ? activityToScopeLine(row) : null;
  }

  const row = await db.cnBOQItemV2.findFirst({
    where: { id: scopeId, orgId, projectId, deletedAt: null },
  });
  return row ? boqToScopeLine(row) : null;
}

/**
 * Guard — throws SCOPE_NOT_IN_PROJECT (400) if the (scopeType, scopeId) ref
 * does not resolve within the given project. Returns the resolved line on
 * success so callers can reuse it.
 */
export async function assertScopeBelongsToProject(
  orgId: string,
  projectId: string,
  scopeType: ScopeType,
  scopeId: string
): Promise<ScopeLine> {
  const line = await resolveScope(orgId, projectId, scopeType, scopeId);
  if (!line) {
    throw new ScopeError(
      "SCOPE_NOT_IN_PROJECT",
      `Scope ${scopeType}:${scopeId} is not part of project ${projectId}`,
      400,
      { scopeType, scopeId, projectId }
    );
  }
  return line;
}
