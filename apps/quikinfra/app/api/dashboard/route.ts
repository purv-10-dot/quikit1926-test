import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenantContext } from "@/lib/auth/context";
import { logger } from "@/lib/observability/logger";

/**
 * GET /api/dashboard
 *
 * KPI tiles + recent activity for the post-login dashboard.
 *
 * KPI definitions:
 *   activeProjects      → CnProject.status = "active"
 *   pendingApprovals    → PR + PO + DPR + WO awaiting any approval step
 *   openPOs             → CnPurchaseOrder.status = "approved" (active POs only)
 *   lowStockItems       → items whose summed stock across visible projects
 *                         falls below their master `minStockLevel`
 *   grnThisMonth        → GRNs with grnDate in the current calendar month
 *   issuesThisMonth     → Material issues with issueDate in the current month
 *   activeWOs           → CnWorkOrder.status = "active"
 *   pendingDPRApproval  → DPRs whose status is not "approved"
 *
 * Project scoping: when ctx.projectIds is a non-empty array the user is
 * site-scoped — every query is filtered to those projects. Otherwise the
 * counts are tenant/org-wide.
 */

// Statuses that mean "this document is still moving through approval".
const PENDING_APPROVAL_STATUSES = [
  "pending_approval",
  "submitted",
  "approved_l1",
  "approved_l2",
];

type ProjectProgressRow = {
  id: string;
  name: string;
  physicalPct: number;
  budgetPct: number;
  band: "on_track" | "in_progress" | "early_stage";
};

export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "No tenant context" } },
      { status: 401 },
    );
  }

  const { orgId, projectIds, roleKey, permissions } = ctx;

  // Scope resolution.
  //
  //   super_admin / "*" permissions  → no org filter (sees everything)
  //   everyone else                  → orgId filter
  //
  // Project-level restriction (projectsAssigned) is independent of the
  // above and still applies whenever the user has a non-empty list.
 

  // Every user — platform admin included — is scoped to their own org.
  // Per-org isolation is enforced everywhere in the ERP; cross-tenant
  // visibility is not a dashboard concern.
//  const tenantScope: Record<string, unknown> = isPlatformAdmin
//   ? { orgId }
//   : { orgId };
 const tenantScope = { orgId };

  const scoped = Array.isArray(projectIds) && projectIds.length > 0;
  const projectScope = scoped ? { projectId: { in: projectIds! } } : {};

  

  // Calendar-month bounds, server-local TZ — good enough for a dashboard tile.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const nextMonth = new Date(monthStart);
  nextMonth.setMonth(monthStart.getMonth() + 1);

  const prisma = db as any;

  const [
    activeProjects,
    pendingPRs,
    pendingPOs,
    pendingDPRs,
    pendingWOs,
    openPOs,
    grnThisMonth,
    issuesThisMonth,
    activeWOs,
    pendingDPRApproval,
    items,
    balances,
    recentPRsRaw,
    recentPOsRaw,
  ] = await Promise.all([
    // 1. Active projects in the DB
    prisma.cnProject.count({
      where: {
        ...tenantScope,
        status: "active",
        ...(scoped ? { id: { in: projectIds! } } : {}),
      },
    }),

    // 2. Pending Approvals — PR + PO + DPR + WO
    prisma.cnPurchaseRequisition.count({
      where: {
        ...tenantScope,
        ...projectScope,
        status: { in: PENDING_APPROVAL_STATUSES },
      },
    }),
    prisma.cnPurchaseOrder.count({
      where: {
        ...tenantScope,
        ...projectScope,
        status: { in: PENDING_APPROVAL_STATUSES },
      },
    }),
    prisma.cnDailyProgressReport.count({
      where: {
        ...tenantScope,
        ...projectScope,
        status: { in: PENDING_APPROVAL_STATUSES },
      },
    }),
    prisma.cnWorkOrder.count({
      where: {
        ...tenantScope,
        ...projectScope,
        status: { in: PENDING_APPROVAL_STATUSES },
      },
    }),

    // 3. Open / active POs — only approved
    prisma.cnPurchaseOrder.count({
      where: { ...tenantScope, ...projectScope, status: "approved" },
    }),

    // 4. GRNs this calendar month
    prisma.cnGoodsReceiptNote.count({
      where: {
        ...tenantScope,
        ...projectScope,
        grnDate: { gte: monthStart, lt: nextMonth },
      },
    }),

    // 5. Material issues this calendar month
    prisma.cnMaterialIssue.count({
      where: {
        ...tenantScope,
        ...projectScope,
        issueDate: { gte: monthStart, lt: nextMonth },
      },
    }),

    // 6. Active work orders
    prisma.cnWorkOrder.count({
      where: { ...tenantScope, ...projectScope, status: "active" },
    }),

    // 7. DPRs not yet approved
    prisma.cnDailyProgressReport.count({
      where: {
        ...tenantScope,
        ...projectScope,
        status: { not: "approved" },
      },
    }),

    // 8. Low stock — items master + stock balances (joined in memory below)
    prisma.cnItem.findMany({
      where: { ...tenantScope, status: "active" },
      select: { id: true, minStockLevel: true },
    }),
    prisma.cnStockBalance.findMany({
      where: {
        ...tenantScope,
        ...(scoped ? { projectId: { in: projectIds! } } : {}),
      },
      select: { itemId: true, quantity: true },
    }),

    // Recent Activity
    prisma.cnPurchaseRequisition.findMany({
      where: { ...tenantScope, ...projectScope },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { project: { select: { name: true } } },
    }),
    prisma.cnPurchaseOrder.findMany({
      where: { ...tenantScope, ...projectScope },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        project: { select: { name: true } },
        vendor: { select: { name: true } },
      },
    }),
  ]);

  // Low-stock roll-up: sum per-item quantity across the user's visible
  // projects, then compare against the item master's `minStockLevel`.
  const totalsByItem = new Map<string, number>();
  for (const r of balances as Array<{ itemId: string; quantity: any }>) {
    const q = Number(r.quantity ?? 0);
    totalsByItem.set(r.itemId, (totalsByItem.get(r.itemId) ?? 0) + q);
  }
  let lowStockItems = 0;
  for (const it of items as Array<{ id: string; minStockLevel: any }>) {
    const min = Number(it.minStockLevel ?? 0);
    if (min <= 0) continue;
    if ((totalsByItem.get(it.id) ?? 0) < min) lowStockItems++;
  }

  const kpis = {
    activeProjects,
    pendingApprovals: pendingPRs + pendingPOs + pendingDPRs + pendingWOs,
    openPOs,
    lowStockItems,
    grnThisMonth,
    issuesThisMonth,
    activeWOs,
    pendingDPRApproval,
  };

  const prs = (recentPRsRaw as any[]).map((pr) => ({
    id: pr.id,
    number: pr.prNumber,
    project: pr.project?.name ?? "",
    date:
      pr.requestDate?.toISOString?.() ?? pr.createdAt?.toISOString?.() ?? "",
    status: pr.status,
  }));

  const pos = (recentPOsRaw as any[]).map((po) => ({
    id: po.id,
    number: po.poNumber,
    vendor: po.vendor?.name ?? "",
    project: po.project?.name ?? "",
    amount: Number(po.totalAmount ?? 0),
    status: po.status,
  }));

  const projectWhere = {
    ...tenantScope,
    status: "active" as const,
    ...(scoped ? { id: { in: projectIds! } } : {}),
  };
  const projectsTop = await (db as any).cnProject.findMany({
    where: projectWhere,
    orderBy: { updatedAt: "desc" },
    take: 3,
    select: { id: true, name: true },
  });

  let projectProgress: ProjectProgressRow[] = [];
  if (projectsTop.length > 0) {
    const ids = projectsTop.map((p: { id: string }) => p.id);
    const aggs = await (db as any).cnBOQItem.groupBy({
      by: ["projectId"],
      where: {
        ...tenantScope,
        projectId: { in: ids },
        isLeaf: true,
        status: "active",
      },
      _avg: { progressPercent: true },
      _sum: { contractAmount: true, executedAmount: true },
    });
    const aggByProject = new Map(
      (aggs as any[]).map((a) => [
        a.projectId,
        {
          avgProg: Number(a._avg?.progressPercent ?? 0),
          contract: Number(a._sum?.contractAmount ?? 0),
          executed: Number(a._sum?.executedAmount ?? 0),
        },
      ]),
    );
    projectProgress = projectsTop.map((p: { id: string; name: string }) => {
      const a = aggByProject.get(p.id);
      const physicalPct = Math.min(100, Math.max(0, Math.round(a?.avgProg ?? 0)));
      const c = a?.contract ?? 0;
      const e = a?.executed ?? 0;
      const budgetPct =
        c > 0 ? Math.min(100, Math.max(0, Math.round((e / c) * 100))) : 0;
      const band =
        physicalPct >= 65
          ? ("on_track" as const)
          : physicalPct >= 30
            ? ("in_progress" as const)
            : ("early_stage" as const);
      return { id: p.id, name: p.name, physicalPct, budgetPct, band };
    });
  }

  return NextResponse.json({ kpis, recentActivity: { prs, pos }, projectProgress });
}
