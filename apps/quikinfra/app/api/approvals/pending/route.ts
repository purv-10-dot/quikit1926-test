import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth/context";
import { canActOnStepForInbox } from "@/lib/approvals/workflow-rbac";
import { parsePagination } from "@/lib/http/pagination";
import { resolveUserNames } from "@/lib/users/resolve-names";

/**
 * GET /api/approvals/pending
 *
 * Workflow-aware inbox. Returns only instances whose current step's
 * actor is the caller — pinned user match, or any caller whose role
 * rank is >= the step's required role. Admins see everything so they
 * can unblock stuck flows.
 *
 * Sourced from `CnApprovalInstance` (Prisma). All entities create their
 * approval instance on submit (see /api/.../submit/route.ts files), so
 * there's a single canonical pending queue. Entity data for the inbox
 * card is enriched per-type (PR amounts pulled from CnPurchaseRequisition;
 * other types fall back to the instance's own fields).
 */

export async function GET(req: NextRequest) {
  const ctxOrResponse = await requireAuth();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType") ?? "";
  const search = searchParams.get("search")?.toLowerCase() ?? "";

  // ─── 1. Workflow-backed instances (Prisma) ────────────────────
  const prismaInstances = await (db as any).cnApprovalInstance.findMany({
    where: {
      orgId: ctx.orgId,
      status: "pending_approval",
      ...(entityType && entityType !== "all" ? { entityType } : {}),
    },
    orderBy: { requestedAt: "desc" },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      entityNumber: true,
      requestedById: true,
      requestedAt: true,
      status: true,
      currentStepOrder: true,
      workflowId: true,
    },
  });

  // Pull every step for every workflow referenced so the actor-check can
  // match against the instance's current step in O(1).
  const workflowIds = Array.from(new Set(prismaInstances.map((i: any) => i.workflowId)));
  const steps = workflowIds.length
    ? await (db as any).cnApprovalWorkflowStep.findMany({
        where: { workflowId: { in: workflowIds } },
      })
    : [];
  const stepByKey = new Map<string, any>();
  for (const s of steps) stepByKey.set(`${s.workflowId}:${s.stepOrder}`, s);

  const actionable = prismaInstances.filter((i: any) => {
    const step = stepByKey.get(`${i.workflowId}:${i.currentStepOrder}`);
    return step ? canActOnStepForInbox(ctx, step) : false;
  });

  // Enrich PR instances with projectName + amount so the UI can render
  // the same columns it did off the in-memory store. Batched lookup —
  // one query for the PR rows, one for the project names.
  const prInstanceIds = actionable
    .filter((i: any) => i.entityType === "purchase_requisitions")
    .map((i: any) => i.entityId);
  const prMap = new Map<string, { projectName: string; estimatedTotal: string }>();
  if (prInstanceIds.length) {
    const prRows = await (db as any).cnPurchaseRequisition.findMany({
      where: { orgId: ctx.orgId, id: { in: prInstanceIds } },
      select: { id: true, projectId: true, estimatedTotal: true },
    });
    const projectIds = Array.from(new Set(prRows.map((r: any) => r.projectId).filter(Boolean)));
    const projectRows = projectIds.length
      ? await (db as any).cnProject.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, name: true },
        })
      : [];
    const projectNameById = new Map<string, string>(projectRows.map((p: any) => [p.id, p.name]));
    for (const r of prRows as any[]) {
      prMap.set(r.id, {
        projectName: projectNameById.get(r.projectId) ?? "",
        estimatedTotal: r.estimatedTotal?.toString?.() ?? "0",
      });
    }
  }

  // Resolve requester display names in a single batch — handles both
  // cn_users (invited team members) and cn_demo_users (seeded admins).
  const requesterIds = actionable.map((i: any) => i.requestedById);
  const nameById = await resolveUserNames(requesterIds);

  const workflowInbox = actionable.map((i: any) => {
    const pr = i.entityType === "purchase_requisitions" ? prMap.get(i.entityId) : null;
    return {
      id: i.id,
      entityType: i.entityType,
      entityId: i.entityId,
      entityNumber: i.entityNumber,
      projectName: pr?.projectName ?? "",
      requestedByName: nameById.get(i.requestedById) ?? "User",
      requestedAt: i.requestedAt?.toISOString?.() ?? null,
      status: i.status,
      amount: pr?.estimatedTotal ?? 0,
      currentStep: i.currentStepOrder,
      workflowDriven: true,
    };
  });

  // ─── Search + return ──────────────────────────────────────────
  let data = workflowInbox;
  if (search) {
    data = data.filter(
      (a: any) =>
        (a.entityNumber ?? "").toLowerCase().includes(search) ||
        (a.projectName ?? "").toLowerCase().includes(search) ||
        (a.requestedByName ?? "").toLowerCase().includes(search),
    );
  }

  const p = parsePagination(req);
  if (p.paginated) {
    const sliced = data.slice(p.skip, p.skip + p.take);
    return NextResponse.json({
      data: sliced,
      total: data.length,
      page: p.page,
      pageSize: p.pageSize,
      hasMore: p.skip + sliced.length < data.length,
    });
  }
  return NextResponse.json({ data, total: data.length });
}
