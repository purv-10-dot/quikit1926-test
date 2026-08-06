/**
 * Projects + Finance route gate (Item 7 batch 4).
 *
 * Covers the project sub-resources (BOQ / DPR / RAB / WBS / Estimation /
 * Work Order / Project) and Finance.
 *
 * Path → resource mapping:
 *   /api/projects/boq/*                       → construction.boq
 *   /api/projects/[id]/boq/*                  → construction.boq
 *   /api/projects/dpr/*                       → construction.dpr
 *   /api/projects/work-orders/*               → construction.wo
 *   /api/projects/rab/*                       → construction.rab
 *   /api/projects/[id]/estimations            → construction.estimation
 *   /api/projects/[id]/wbs/tasks/*            → construction.wbs
 *   /api/projects/hindrance/*                 → construction.hindrance
 *   /api/projects/documents                   → construction.documents
 *   /api/finance/*                            → construction.finance
 *
 * Usage:
 *   const ctxOrResp = await requireProjectsFinanceAction("construction.dpr", "approve");
 *   if (ctxOrResp instanceof NextResponse) return ctxOrResp;
 *   const ctx = ctxOrResp;
 */

import { NextResponse } from "next/server";
import { getTenantContext, type TenantContext } from "@/lib/auth/context";

export type ProjectsFinanceResource =
  | "construction.project"
  | "construction.boq"
  | "construction.activity_scope"
  | "construction.wbs"
  | "construction.estimation"
  | "construction.wo"
  | "construction.dpr"
  | "construction.gantt"
  | "construction.hindrance"
  | "construction.documents"
  | "construction.rab"
  | "construction.finance";

export type ProjectsFinanceAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "reverse"
  | "import"
  | "lock";

export async function requireProjectsFinanceAction(
  resource: ProjectsFinanceResource,
  action: ProjectsFinanceAction,
): Promise<TenantContext | NextResponse> {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json(
      { error: "Unauthenticated" },
      { status: 401 },
    );
  }
  const key = `${resource}.${action}`;
  if (!ctx.permissions.has(key) && !ctx.permissions.has("*")) {
    return NextResponse.json(
      { error: `Missing permission: ${key}` },
      { status: 403 },
    );
  }
  return ctx;
}
