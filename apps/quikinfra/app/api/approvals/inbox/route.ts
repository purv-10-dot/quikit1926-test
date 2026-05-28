import { NextRequest, NextResponse } from "next/server";
import { requireAuth, hasPermission } from "@/lib/auth/context";
import { ok } from "@/lib/http/envelope";
import { db } from "@/lib/db/prisma";
import { listPRs } from "@/lib/purchase/pr-repository";
import { listIndents } from "@/lib/purchase/indent-repository";
import { listPOs } from "@/lib/purchase/po-repository";
import { listGRNs } from "@/lib/purchase/grn-repository";
import { listMaterialIssues } from "@/lib/store/material-issue-repository";
import { listStockTransfers } from "@/lib/store/stock-transfer-repository";
import { canActOnStepForInbox } from "@/lib/approvals/workflow-rbac";

/**
 * GET /api/approvals/inbox?status=pending|approved|all
 *
 * Returns every entity matching the requested lifecycle filter, scoped to
 * the entity types the calling user can act on (cross-checked against
 * their permission set):
 *   - "pending"  (default) — items still waiting on an approval action
 *   - "approved"           — items that have moved past approval (terminal
 *                            approved states; excludes draft / rejected)
 *   - "all"                — both
 *
 * Every entity type now reads from Postgres — there is no demo-store
 * fallback. Each block tenant-scopes its own query and applies project
 * scoping when the caller is project-restricted.
 */
export async function GET(req: NextRequest) {
  const ctxOrResponse = await requireAuth();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  const statusFilter = (req.nextUrl.searchParams.get("status") ?? "pending").toLowerCase();
  const includePending = statusFilter === "pending" || statusFilter === "all";
  const includeApproved = statusFilter === "approved" || statusFilter === "all";

  const items: Array<{
    id: string;
    entityType: string;
    title: string;
    subtitle?: string;
    status: string;
    submittedBy?: string;
    submittedAt?: string;
    href: string;
    amount?: number;
    /**
     * True when the caller is an authorized approver for this item's
     * current workflow step. Used by the client to mark rows the user
     * is only watching (read-only) vs ones they can actually approve.
     * Computed in a single batch lookup after every per-entity block
     * has resolved (see end of handler). Defaults to undefined here
     * so the per-block mappers don't need to know about it.
     */
    canAct?: boolean;
  }> = [];

  // Helper: true if entity status is in any actionable approval state.
  const isPending = (s: string | undefined) => {
    const v = String(s ?? "").toLowerCase();
    return [
      "submitted",
      "pending_approval",
      "submitted_l1",
      "approved_l1",
      "approved_l2",
      "pending_l1",
      "pending_l2",
      "under_review",
    ].includes(v);
  };

  // Helper: true if entity is in a terminal-approved state (the approval
  // chain is done). We deliberately exclude pre-submit (draft) and
  // negative outcomes (rejected / cancelled) so the Approved tab reads
  // as "things you-or-your-peers signed off on", not just "everything".
  const isApproved = (s: string | undefined) => {
    const v = String(s ?? "").toLowerCase();
    if (isPending(v)) return false;
    return ![
      "",
      "draft",
      "rejected",
      "cancelled",
      "inactive",
    ].includes(v);
  };

  // Combined predicate per the requested filter.
  const matches = (s: string | undefined) => {
    if (includePending && isPending(s)) return true;
    if (includeApproved && isApproved(s)) return true;
    return false;
  };

  // Read scope — when the user is project-restricted, the same restriction
  // flows down to every list call so they don't see entities on projects
  // they shouldn't.
  const projectIds = Array.isArray(ctx.projectIds) ? ctx.projectIds : undefined;

  type Item = (typeof items)[number];

  // Each block becomes a small fetcher that returns its own items array.
  // We collect them into `tasks` and run all of them in parallel via
  // Promise.allSettled — total wall time is now `max(query)` instead of
  // `sum(queries)` (was up to 9× slower when every permission was held).
  const tasks: Array<Promise<Item[]>> = [];

  // ── MR / Purchase Requisitions ──────────────────────────────
  if (hasPermission(ctx, "purchase.mr.approve")) {
    tasks.push(
      listPRs({ orgId: ctx.orgId, projectIds })
        .then((prs) =>
          prs
            .filter((r: any) => matches(r.status))
            .map((r: any) => ({
              id: r.id,
              entityType: "mr",
              title: r.mrNumber ?? r.prNumber ?? `MR ${r.id}`,
              subtitle: r.projectName ?? r.purpose ?? "",
              status: r.status,
              submittedBy: r.createdBy,
              submittedAt: r.requestDate ?? r.createdAt,
              href: `/purchase/requisitions/${r.id}`,
              amount: r.estimatedTotal ? parseFloat(r.estimatedTotal) : undefined,
            })),
        )
        .catch((err) => {
          console.error("[approvals-inbox] listPRs failed", err);
          return [] as Item[];
        }),
    );
  }

  // ── Indents ─────────────────────────────────────────────────
  if (
    hasPermission(ctx, "purchase.indent.approve_l1") ||
    hasPermission(ctx, "purchase.indent.approve_l2") ||
    hasPermission(ctx, "purchase.indent.approve_l3")
  ) {
    tasks.push(
      listIndents({ orgId: ctx.orgId, projectIds })
        .then((indents) =>
          indents
            .filter((i: any) => matches(i.status))
            .map((i: any) => ({
              id: i.id,
              entityType: "indent",
              title: i.indentNumber ?? `Indent ${i.id}`,
              subtitle: i.projectName ?? "",
              status: i.status,
              submittedBy: i.createdBy,
              submittedAt: i.createdAt,
              href: `/purchase/indents/${i.id}`,
            })),
        )
        .catch((err) => {
          console.error("[approvals-inbox] listIndents failed", err);
          return [] as Item[];
        }),
    );
  }

  // ── Purchase Orders ─────────────────────────────────────────
  if (
    hasPermission(ctx, "purchase.po.approve_l1") ||
    hasPermission(ctx, "purchase.po.approve_l2")
  ) {
    tasks.push(
      listPOs({ orgId: ctx.orgId, projectIds })
        .then((pos) =>
          pos
            .filter((p: any) => matches(p.status))
            .map((p: any) => ({
              id: p.id,
              entityType: "po",
              title: p.poNumber ?? `PO ${p.id}`,
              subtitle: `${p.vendorName ?? ""} · ${p.projectName ?? ""}`,
              status: p.status,
              submittedBy: p.createdBy,
              submittedAt: p.poDate ?? p.createdAt,
              href: `/purchase/orders/${p.id}`,
              amount: p.totalAmount ? parseFloat(p.totalAmount) : undefined,
            })),
        )
        .catch((err) => {
          console.error("[approvals-inbox] listPOs failed", err);
          return [] as Item[];
        }),
    );
  }

  // ── GRNs ────────────────────────────────────────────────────
  if (hasPermission(ctx, "purchase.grn.approve")) {
    tasks.push(
      listGRNs({ orgId: ctx.orgId, projectIds })
        .then((grns) =>
          grns
            .filter((g0: any) => matches(g0.status))
            .map((g0: any) => ({
              id: g0.id,
              entityType: "grn",
              title: g0.grnNumber ?? `GRN ${g0.id}`,
              subtitle: `${g0.vendorName ?? ""} · ${g0.projectName ?? ""}`,
              status: g0.status,
              submittedBy: g0.createdBy,
              submittedAt: g0.grnDate ?? g0.createdAt,
              href: `/store/grn/${g0.id}`,
            })),
        )
        .catch((err) => {
          console.error("[approvals-inbox] listGRNs failed", err);
          return [] as Item[];
        }),
    );
  }

  // ── Material Issues ─────────────────────────────────────────
  if (hasPermission(ctx, "store.issue.approve")) {
    tasks.push(
      listMaterialIssues(ctx.orgId, { allowedProjectIds: projectIds ?? null })
        .then((issues) =>
          issues
            .filter((it: any) => matches(it.status))
            .map((it: any) => ({
              id: it.id,
              entityType: "issue",
              title: it.issueNumber ?? `Issue ${it.id}`,
              subtitle: `${it.projectName ?? ""} · ${it.purpose ?? ""}`,
              status: it.status,
              submittedAt: it.issueDate ?? it.createdAt,
              href: `/store/issue/${it.id}`,
            })),
        )
        .catch((err) => {
          console.error("[approvals-inbox] listMaterialIssues failed", err);
          return [] as Item[];
        }),
    );
  }

  // ── Stock Transfers ─────────────────────────────────────────
  if (hasPermission(ctx, "store.transfer.approve")) {
    tasks.push(
      listStockTransfers(ctx.orgId, { allowedProjectIds: projectIds ?? null })
        .then((transfers) =>
          transfers
            .filter((t: any) => matches(t.status))
            .map((t: any) => ({
              id: t.id,
              entityType: "transfer",
              title: t.transferNumber ?? `Transfer ${t.id}`,
              subtitle: `${t.fromLocationName ?? ""} → ${t.toLocationName ?? ""}`,
              status: t.status,
              submittedAt: t.transferDate ?? t.createdAt,
              href: `/store/transfer/${t.id}`,
            })),
        )
        .catch((err) => {
          console.error("[approvals-inbox] listStockTransfers failed", err);
          return [] as Item[];
        }),
    );
  }

  // ── Stock Reconciliations ───────────────────────────────────
  if (hasPermission(ctx, "store.recon.approve")) {
    tasks.push(
      (db as any).cnStockReconciliation
        .findMany({
          where: {
            orgId: ctx.orgId,
            ...(projectIds ? { projectId: { in: projectIds } } : {}),
          },
          orderBy: { createdAt: "desc" },
        })
        .then((recons: any[]) =>
          recons
            .filter((r) => matches(r.status))
            .map((r) => ({
              id: r.id,
              entityType: "recon",
              title: r.reconciliationNumber ?? `Recon ${r.id}`,
              subtitle: "",
              status: r.status,
              submittedBy: r.createdBy,
              submittedAt:
                r.reconciliationDate?.toISOString?.() ??
                r.createdAt?.toISOString?.() ??
                "",
              href: `/store/reconciliation/${r.id}`,
            })),
        )
        .catch((err: unknown) => {
          console.error("[approvals-inbox] listStockReconciliations failed", err);
          return [] as Item[];
        }),
    );
  }

  // ── DPRs ────────────────────────────────────────────────────
  if (hasPermission(ctx, "dpr.approve")) {
    tasks.push(
      (db as any).cnDailyProgressReport
        .findMany({
          where: {
            orgId: ctx.orgId,
            ...(projectIds ? { projectId: { in: projectIds } } : {}),
          },
          orderBy: { createdAt: "desc" },
          include: { project: { select: { name: true } } },
        })
        .then((dprs: any[]) =>
          dprs
            .filter((d) => matches(d.status))
            .map((d) => {
              const reportDate = d.reportDate?.toISOString().slice(0, 10) ?? "";
              return {
                id: d.id,
                entityType: "dpr",
                title: d.dprNumber ?? `DPR ${d.id}`,
                subtitle: `${d.project?.name ?? ""} · ${reportDate}`,
                status: d.status,
                submittedBy: d.createdBy,
                submittedAt:
                  d.reportDate?.toISOString?.() ??
                  d.createdAt?.toISOString?.() ??
                  "",
                href: `/projects/dpr/${d.id}`,
              };
            }),
        )
        .catch((err: unknown) => {
          console.error("[approvals-inbox] listDPRs failed", err);
          return [] as Item[];
        }),
    );
  }

  // ── RABs ────────────────────────────────────────────────────
  if (hasPermission(ctx, "rab.approve")) {
    tasks.push(
      (db as any).cnRunningAccountBill
        .findMany({
          where: {
            orgId: ctx.orgId,
            ...(projectIds ? { projectId: { in: projectIds } } : {}),
          },
          orderBy: { createdAt: "desc" },
          include: {
            project: { select: { name: true } },
            contractor: { select: { name: true } },
          },
        })
        .then((rabs: any[]) =>
          rabs
            .filter((rab) => matches(rab.status))
            .map((rab) => ({
              id: rab.id,
              entityType: "rab",
              title: rab.rabNumber ?? `RAB ${rab.id}`,
              subtitle: `${rab.project?.name ?? ""} · ${rab.contractor?.name ?? ""}`,
              status: rab.status,
              submittedBy: rab.createdBy,
              submittedAt: rab.createdAt?.toISOString?.() ?? "",
              href: `/projects/rab/${rab.id}`,
              amount: rab.currentBillAmount
                ? Number(rab.currentBillAmount.toString())
                : undefined,
            })),
        )
        .catch((err: unknown) => {
          console.error("[approvals-inbox] listRABs failed", err);
          return [] as Item[];
        }),
    );
  }

  // Run every fetcher in parallel. allSettled means one failing block
  // doesn't take the whole inbox down — we already swallow errors
  // per-block above, but keeping allSettled for defence in depth.
  const settled = await Promise.allSettled(tasks);
  for (const r of settled) {
    if (r.status === "fulfilled") items.push(...r.value);
  }

  // ── canAct flag — one batch query, no N+1. ──────────────────────────
  // The caller may be the wildcard ADMIN who can SEE every pending row
  // (the per-block permission gate let them through) but should only be
  // able to ACT on rows where their userId is in the current step's
  // approver pool. We look up the active CnApprovalInstance + its
  // workflow steps for every (entityType, entityId) in `items`, then
  // run canActOnStepForInbox against the current step. Items without an
  // approval instance (orphan / legacy submissions) default to canAct
  // true so existing flows keep working — the per-route guard is still
  // the source of truth on click.
  if (items.length > 0) {
    try {
      const instances: any[] = await (db as any).cnApprovalInstance.findMany({
        where: {
          orgId: ctx.orgId,
          status: "pending_approval",
          // Tuple-match on (entityType, entityId). Prisma's `in` only
          // accepts scalar arrays, so we widen with two `in` lists and
          // filter the cross-product in memory below.
          entityType: { in: Array.from(new Set(items.map((i) => i.entityType))) },
          entityId: { in: items.map((i) => i.id) },
        },
        select: {
          entityType: true,
          entityId: true,
          currentStepOrder: true,
          workflow: {
            select: {
              steps: {
                select: {
                  stepOrder: true,
                  approverUserId: true,
                  approverUserIds: true,
                  approverRoleId: true,
                },
              },
            },
          },
        },
      });

      // Lookup map keyed by `${entityType}::${entityId}` for O(1) reads
      // while iterating items.
      const byKey = new Map<string, any>();
      for (const inst of instances) {
        byKey.set(`${inst.entityType}::${inst.entityId}`, inst);
      }

      const actor = { userId: ctx.userId, roleKey: ctx.roleKey };
      for (const it of items) {
        const inst = byKey.get(`${it.entityType}::${it.id}`);
        if (!inst) {
          // No active instance — default to true so legacy/non-workflow
          // entities don't get marked read-only across the board.
          it.canAct = true;
          continue;
        }
        const step = inst.workflow?.steps?.find(
          (s: any) => s.stepOrder === inst.currentStepOrder,
        );
        if (!step) {
          it.canAct = true;
          continue;
        }
        it.canAct = canActOnStepForInbox(actor, {
          approverUserId: step.approverUserId,
          approverUserIds: step.approverUserIds,
          approverRoleId: step.approverRoleId,
        });
      }
    } catch (err) {
      // Failure to compute the flag is non-fatal — the inbox still
      // renders, every row just shows as actionable (current pre-change
      // behavior). Per-route guards still enforce the real rule.
      console.error("[approvals-inbox] canAct batch lookup failed", err);
      for (const it of items) it.canAct = true;
    }
  }

  // Sort newest first. Coerce to ISO strings so Date objects from Prisma
  // and string ISO values from the legacy store sort consistently.
  items.sort((a, b) => {
    const av = a.submittedAt ? new Date(a.submittedAt).toISOString() : "";
    const bv = b.submittedAt ? new Date(b.submittedAt).toISOString() : "";
    return bv.localeCompare(av);
  });

  return ok({ items, total: items.length });
}
