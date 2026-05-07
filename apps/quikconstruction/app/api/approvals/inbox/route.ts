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
      listPRs({ tenantId: ctx.tenantId, orgId: ctx.orgId, projectIds })
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
      listIndents({ tenantId: ctx.tenantId, orgId: ctx.orgId, projectIds })
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
      listPOs({ tenantId: ctx.tenantId, orgId: ctx.orgId, projectIds })
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
      listGRNs({ tenantId: ctx.tenantId, orgId: ctx.orgId, projectIds })
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
      listMaterialIssues(ctx.tenantId, { allowedProjectIds: projectIds ?? null })
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
      listStockTransfers(ctx.tenantId, { allowedProjectIds: projectIds ?? null })
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
            tenantId: ctx.tenantId,
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
            tenantId: ctx.tenantId,
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
            tenantId: ctx.tenantId,
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

  // Sort newest first. Coerce to ISO strings so Date objects from Prisma
  // and string ISO values from the legacy store sort consistently.
  items.sort((a, b) => {
    const av = a.submittedAt ? new Date(a.submittedAt).toISOString() : "";
    const bv = b.submittedAt ? new Date(b.submittedAt).toISOString() : "";
    return bv.localeCompare(av);
  });

  return ok({ items, total: items.length });
}
