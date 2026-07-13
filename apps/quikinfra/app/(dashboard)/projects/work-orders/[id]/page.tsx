"use client";

/**
 * Work Order — detail page.
 *
 * Layout mirrors the Material Estimation detail screen:
 *   - Action pills (Status · Edit · Submit / Approve / Reject) live in
 *     the page header so the user always sees the available next steps
 *     next to the title.
 *   - Two-column body: Overview + BOQ Scope on the left; Approval
 *     Timeline + Audit pinned in a right sidebar so reviewers see who
 *     acted (and when) right next to the totals.
 *   - Overview card splits into a stat grid + a highlighted Total Value
 *     callout on the right, with the Scope / Title quoted at the bottom
 *     so long titles don't crowd the grid.
 *
 * Edit and Delete are locked once the WO is `approved` — an approved
 * WO is the binding contract with the contractor, so silently editing
 * it would break the audit trail.
 */
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Pencil,
  Send,
  Trash2,
  X as XIcon,
} from "lucide-react";
import {
  PageHeader,
  PageContainer,
  PageSkeleton,
  StatusChip,
  ApprovalTimeline,
} from "@/components/PageShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatDateTimeIST } from "@/lib/format/datetime";
import { WorkflowConfirmDialog } from "@/components/WorkflowConfirmDialog";
import {
  useWorkOrder,
  useUpdateWorkOrder,
} from "@/hooks/use-projects";
import { useWorkCategories } from "@/hooks/use-masters";
import { usePermissions } from "@/hooks/use-permissions";
import { useWorkflowConfirm } from "@/hooks/use-workflow-confirm";
import { isLabourWorkType, labourLineFromWoItem, sumLabourQty } from "@/lib/projects/labour-scope";
import { LABOUR_TYPE_OPTIONS } from "@/lib/projects/labour-types";

const MENU_KEY = "pm.work_orders";

import type { ApprovalHistoryEntry } from "@/lib/approvals/approval-info";
import type { BoqScopeItem, WorkOrderDetail } from "@/lib/projects/work-order-detail";

// ── Formatting helpers ─────────────────────────────────────────────
const fmtInr = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n)
    ? `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
    : "—";
};
const fmtQty = (v: unknown, unit?: string | null) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ""}`;
};
const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};
const fmtPct = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? "0%" : `${v}%`;

// ── Header pill design tokens ──────────────────────────────────────
// Same template used by the Material Estimation detail page so the two
// screens read as a coordinated set: identical height, padding, radius,
// icon size, font weight — only the tone changes.
const HEADER_PILL =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0";

const PILL_TONE = {
  gray: "bg-gray-50 text-gray-700 border-gray-200",
  blue: "bg-orange-50 text-orange-700 border-orange-200",
  orange: "bg-orange-50 text-orange-700 border-orange-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  disabled: "bg-gray-50 text-gray-400 border-gray-200",
} as const;

function statusPillTone(status: string | null | undefined): string {
  const s = String(status ?? "draft").toLowerCase();
  if (s === "approved") return PILL_TONE.emerald;
  if (s === "rejected") return PILL_TONE.rose;
  if (s === "pending_approval") return PILL_TONE.amber;
  if (s === "inactive") return PILL_TONE.disabled;
  return PILL_TONE.gray;
}

function statusLabel(status: string | null | undefined): string {
  const s = String(status ?? "draft");
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: wo, isLoading } = useWorkOrder(id);
  const updateMutation = useUpdateWorkOrder();

  const { permissionMatrix, isSuper } = usePermissions();
  const matrixRow = permissionMatrix?.[MENU_KEY];
  const canEdit = isSuper || !matrixRow || matrixRow.edit !== false;
  const canDelete = isSuper || !matrixRow || matrixRow.delete !== false;
  const canSubmit = canEdit;
  // Approve/Reject visibility comes from the workflow's current step
  // (server-computed in the WO GET as `approval.canActOnCurrentStep`),
  // not the caller's role.
  const canApprove =
    isSuper || wo?.approval?.canActOnCurrentStep === true;

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const workflow = useWorkflowConfirm({
    submitUrl: `/api/projects/work-orders/${id}/submit`,
    approveUrl: `/api/projects/work-orders/${id}/approve`,
    invalidateKeys: [["work-order", id], ["work-orders"]],
  });

  const boqItems: BoqScopeItem[] = useMemo(
    () => (Array.isArray(wo?.boqItems) ? wo.boqItems : []),
    [wo],
  );
  const isLabourOnly = isLabourWorkType(wo?.workType);
  const { data: workCategoriesResult } = useWorkCategories();
  const workCategoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of workCategoriesResult?.data ?? []) {
      map.set(w.id, w.name);
    }
    return map;
  }, [workCategoriesResult]);
  const labourTypeLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of LABOUR_TYPE_OPTIONS) map.set(o.value, o.label);
    return (v: string) => map.get(v) ?? v;
  }, []);
  const labourLines = useMemo(
    () => (isLabourOnly ? boqItems.map((it) => labourLineFromWoItem(it)) : []),
    [boqItems, isLabourOnly],
  );

  // ApprovalTimeline expects { step, action, actionBy, actionAt, comments } —
  // map the API's history rows to that shape and pre-format the
  // timestamp so the panel doesn't render the raw ISO string.
  const approvalEntries =
    wo?.approval?.history?.map((h: ApprovalHistoryEntry) => ({
      step: h.stepOrder ?? 0,
      action: h.action,
      actionBy: h.actionByName ?? "User",
      actionAt: h.actionAt ? formatDateTimeIST(h.actionAt) : "",
      comments: h.comments ?? undefined,
    })) ?? [];

  if (isLoading) return <PageSkeleton />;
  if (!wo) {
    return (
      <>
        <PageHeader
          title="Work Order"
          breadcrumbs={[
            { label: "Projects", href: "/projects" },
            { label: "Work Orders", href: "/projects/work-orders" },
            { label: id },
          ]}
          onBack={() => router.push("/projects/work-orders")}
        />
        <PageContainer>
          <p className="text-gray-500 py-12 text-center">
            Work order not found.
          </p>
        </PageContainer>
      </>
    );
  }

  const status = String(wo.status ?? "draft").toLowerCase();
  const isDraft = status === "draft";
  const isPending = status === "pending_approval";
  const isApproved = status === "approved";
  const isRejected = status === "rejected";
  const isInactive = status === "inactive";
  const baseLocked = isApproved || isInactive;

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await updateMutation.mutateAsync({ id, status: "inactive" });
      setDeleteConfirm(false);
      router.push("/projects/work-orders");
    } catch { /* error toast handled globally */ }
    finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={wo.woNumber ?? `Work Order ${id}`}
        subtitle={
          wo.contractorName
            ? `Contractor — ${wo.contractorName}`
            : "Work Order"
        }
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: "Work Orders", href: "/projects/work-orders" },
          { label: wo.woNumber ?? id },
        ]}
        onBack={() => router.push("/projects/work-orders")}
        actions={
          <div className="flex items-center gap-2">
            {/* Status pill — leads the row so the user sees state first. */}
            <span className={`${HEADER_PILL} ${statusPillTone(wo.status)}`}>
              {statusLabel(wo.status)}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() =>
                  !baseLocked &&
                  router.push(`/projects/work-orders/${id}/edit`)
                }
                disabled={baseLocked}
                className={`${HEADER_PILL} ${
                  baseLocked
                    ? `${PILL_TONE.disabled} cursor-not-allowed`
                    : `${PILL_TONE.blue} hover:bg-orange-100`
                }`}
                title={
                  baseLocked
                    ? "Locked — work order is approved"
                    : "Edit work order"
                }
              >
                <Pencil className="w-4 h-4" /> Edit
              </button>
            )}
            {canDelete && !baseLocked && (
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className={`${HEADER_PILL} ${PILL_TONE.rose} hover:bg-rose-100`}
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )}
            {isDraft && canSubmit && (
              <button
                type="button"
                onClick={() => workflow.open("submit")}
                className={`${HEADER_PILL} ${PILL_TONE.orange} hover:bg-orange-100`}
              >
                <Send className="w-4 h-4" /> Submit for Approval
              </button>
            )}
            {isPending && canApprove && (
              <>
                <button
                  type="button"
                  onClick={() => workflow.open("approve")}
                  className={`${HEADER_PILL} ${PILL_TONE.emerald} hover:bg-emerald-100`}
                >
                  <Check className="w-4 h-4" /> Approve
                </button>
                <button
                  type="button"
                  onClick={() => workflow.open("reject")}
                  className={`${HEADER_PILL} ${PILL_TONE.rose} hover:bg-rose-100`}
                >
                  <XIcon className="w-4 h-4" /> Reject
                </button>
              </>
            )}
            {isPending && !canApprove && (
              <span className={`${HEADER_PILL} ${PILL_TONE.amber}`}>
                Awaiting approver
              </span>
            )}
            {isApproved && (
              <span className={`${HEADER_PILL} ${PILL_TONE.emerald}`}>
                <Check className="w-4 h-4" /> Locked — approved
              </span>
            )}
          </div>
        }
      />

      <PageContainer>
        {/* Two-column layout matching the Material Estimation detail
            page: main content stack on the left, Approval Timeline +
            Audit pinned in a right sidebar. Collapses to a single
            column under lg. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* ── Overview card ────────────────────────────────────
                Stat grid on the left, KPI callouts (Total Value,
                Progress) anchored to the right edge, Scope / Title
                quoted at the bottom so long titles don't crowd the
                grid. */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  Overview
                </h2>
                <div className="flex items-center gap-2">
                  <StatusChip status={wo.status ?? "draft"} />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
                {/* Left: stat grid */}
                <dl className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 px-6 py-5 text-sm">
                  <OverviewStat label="Project">
                    <span className="font-medium text-gray-900 truncate">
                      {wo.projectName ?? "—"}
                    </span>
                  </OverviewStat>

                  <OverviewStat label="WO Number">
                    <span className="font-mono text-xs font-semibold text-gray-900 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-100">
                      {wo.woNumber ?? "—"}
                    </span>
                  </OverviewStat>

                  <OverviewStat label="Contractor">
                    <span className="font-medium text-gray-900 truncate">
                      {wo.contractorName ?? "—"}
                    </span>
                  </OverviewStat>

                  <OverviewStat label="WO Type">
                    <span className="text-gray-900">{wo.type ?? "—"}</span>
                  </OverviewStat>

                  <OverviewStat label="Work Type">
                    <span className="text-gray-900 truncate">
                      {wo.workType ?? "—"}
                    </span>
                  </OverviewStat>

                  <OverviewStat label="Status">
                    <StatusChip status={wo.status ?? "draft"} />
                  </OverviewStat>

                  <OverviewStat label="Planned Start">
                    <span className="text-gray-900">
                      {fmtDate(wo.plannedStart)}
                    </span>
                  </OverviewStat>

                  <OverviewStat label="Planned End">
                    <span className="text-gray-900">
                      {fmtDate(wo.plannedEnd)}
                    </span>
                  </OverviewStat>

                  <OverviewStat label="Retention %">
                    <span className="text-gray-900 tabular-nums">
                      {fmtPct(wo.retentionPct)}
                    </span>
                  </OverviewStat>

                  <OverviewStat label="Security Deposit %">
                    <span className="text-gray-900 tabular-nums">
                      {fmtPct(wo.securityDepositPct)}
                    </span>
                  </OverviewStat>

                  <OverviewStat label="TDS %">
                    <span className="text-gray-900 tabular-nums">
                      {fmtPct(wo.tdsPct)}
                    </span>
                  </OverviewStat>

                  <OverviewStat label="Progress">
                    <span className="text-gray-900 tabular-nums">
                      {Number(wo.progressPct ?? 0).toFixed(1)}%
                    </span>
                  </OverviewStat>
                </dl>

                {/* Right: KPI callouts. Stacked on lg+ so they anchor
                    the right edge of the card. Total Value gets the
                    headline gradient treatment; Progress sits below. */}
                <div className="lg:col-span-4 bg-gradient-to-br from-gray-50 to-white border-t lg:border-t-0 lg:border-l border-gray-100 p-5 flex flex-col gap-3">
                  <div className="rounded-lg bg-gradient-to-br from-orange-50 to-sky-50 border border-orange-200 px-4 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-orange-700">
                      Total Value
                    </div>
                    <div className="mt-1 text-2xl font-extrabold text-orange-700 tabular-nums">
                      {fmtInr(wo.totalAmount)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white border border-gray-200 px-4 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Progress
                    </div>
                    <div className="mt-1 text-lg font-bold text-gray-900 tabular-nums">
                      {Number(wo.progressPct ?? 0).toFixed(1)}%
                    </div>
                    {/* Inline progress bar so the percent has visual
                        weight even at 0%. */}
                    <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full bg-orange-500 transition-all"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(100, Number(wo.progressPct ?? 0)),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Scope / Title — anchored to its own row so long text
                  doesn't wreck the stat grid alignment. Left indigo
                  bar marks it as a reference detail, not a stat. */}
              {wo.title && (
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-0.5">
                      Scope / Title
                    </div>
                    <p className="text-sm text-gray-800 leading-relaxed">
                      {wo.title}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Scope (Labour details or BOQ) ─────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  {isLabourOnly ? "Work Order Details" : "BOQ Scope"}
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                  {boqItems.length} item{boqItems.length === 1 ? "" : "s"}
                </span>
              </div>

              {boqItems.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-gray-500">
                  No scope items.
                </p>
              ) : isLabourOnly ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 tracking-wider border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-bold w-10">#</th>
                        <th className="px-4 py-3 text-left font-bold">Date</th>
                        <th className="px-4 py-3 text-left font-bold">Activity Name</th>
                        <th className="px-4 py-3 text-left font-bold">Description</th>
                        <th className="px-4 py-3 text-left font-bold">Group</th>
                        <th className="px-4 py-3 text-left font-bold">Labour Type &amp; Count</th>
                        <th className="px-4 py-3 text-right font-bold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {labourLines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-indigo-50/20 transition-colors">
                          <td className="px-4 py-3 text-xs font-mono text-gray-400 tabular-nums">
                            {String(idx + 1).padStart(2, "0")}
                          </td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                            {fmtDate(line.lineDate)}
                          </td>
                          <td className="px-4 py-3 text-gray-900">{line.activityName || "—"}</td>
                          <td className="px-4 py-3 text-gray-700">
                            {line.description || "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {workCategoryNameById.get(line.workCategoryId) ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {line.labourTypes.length
                              ? line.labourTypes
                                  .map(
                                    (lt) =>
                                      `${labourTypeLabel(lt.type)} (${
                                        fmtQty(lt.count) || 0
                                      })`,
                                  )
                                  .join(", ")
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {sumLabourQty(line.labourTypes)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 tracking-wider border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-bold w-10">
                          #
                        </th>
                        <th className="px-4 py-3 text-left font-bold">
                          Item Code
                        </th>
                        <th className="px-4 py-3 text-left font-bold">
                          Description
                        </th>
                        <th className="px-4 py-3 text-left font-bold">UOM</th>
                        <th className="px-4 py-3 text-right font-bold">
                          Quantity
                        </th>
                        <th className="px-4 py-3 text-right font-bold">
                          Rate (₹)
                        </th>
                        <th className="px-6 py-3 text-right font-bold">
                          Amount (₹)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {boqItems.map((it: BoqScopeItem, idx: number) => (
                        <tr key={idx} className="hover:bg-indigo-50/20 transition-colors">
                          <td className="px-4 py-3 text-xs font-mono text-gray-400 tabular-nums">
                            {String(idx + 1).padStart(2, "0")}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-700">
                            {it.boqNo ?? it.itemCode ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            {it.description ?? it.itemName ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-700 uppercase">
                            {it.uomCode ?? it.uom ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {fmtQty(it.quantity)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {fmtInr(it.rate)}
                          </td>
                          <td className="px-6 py-3 text-right tabular-nums font-medium text-gray-900">
                            {fmtInr(it.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gradient-to-r from-orange-50/60 via-sky-50/40 to-white border-t border-gray-200">
                      <tr>
                        <td
                          className="px-4 py-3 text-sm font-bold text-gray-700"
                          colSpan={6}
                        >
                          Grand Total
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums font-bold text-orange-700">
                          {fmtInr(wo.totalAmount)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Rejection reason — page-level context, not a per-step row */}
            {isRejected && wo.rejectionReason && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl px-5 py-4 text-sm text-rose-800">
                <div className="font-semibold mb-1">Rejection reason</div>
                <div>{wo.rejectionReason}</div>
              </div>
            )}

            {workflow.error && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>{workflow.error}</div>
              </div>
            )}
          </div>

          {/* ── Right sidebar: Approval Timeline + Audit ──────────── */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Approval Timeline
              </h3>
              {!wo.approval ? (
                <p className="text-sm text-gray-500">
                  Not yet submitted for approval.
                </p>
              ) : approvalEntries.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Submitted, but no approval activity yet.
                </p>
              ) : (
                <ApprovalTimeline entries={approvalEntries} />
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Audit
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Created
                  </div>
                  <div className="mt-0.5 text-gray-900">
                    {formatDateTimeIST(wo.createdAt)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Created By
                  </div>
                  <div className="mt-0.5 text-gray-900">
                    {wo.createdByName ?? wo.createdBy ?? "—"}
                  </div>
                </div>
                {wo.updatedAt && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Last Updated
                    </div>
                    <div className="mt-0.5 text-gray-900">
                      {formatDateTimeIST(wo.updatedAt)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </PageContainer>

      {/* Soft-delete confirmation */}
      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => !deleting && setDeleteConfirm(false)}
        onConfirm={confirmDelete}
        loading={deleting}
        tone="danger"
        title="Delete Work Order"
        confirmLabel="Delete"
        message={
          <>
            Mark work order{" "}
            <span className="font-semibold text-gray-900">
              {wo.woNumber ?? ""}
            </span>{" "}
            as inactive? It will be hidden from the list.
          </>
        }
      />

      {/* Submit / Approve / Reject confirmation — shared component */}
      <WorkflowConfirmDialog
        action={workflow.action}
        pending={workflow.pending}
        rejectReason={workflow.rejectReason}
        onRejectReasonChange={workflow.setRejectReason}
        onClose={workflow.close}
        onConfirm={workflow.run}
        entityNoun="Work Order"
        entityLabel={wo.woNumber ?? ""}
        approveHint="Once approved it becomes the binding contract with the contractor."
        rejectPlaceholder="e.g. rate negotiation incomplete — pending finance sign-off"
      />
    </>
  );
}

// ── Local helpers ─────────────────────────────────────────────────

/**
 * Uniform stat cell used by the Overview grid. Icon sits in a tinted
 * square on the left, label stacks above the value. Mirrors the
 * Material Estimation page so the two screens scan identically.
 */
function OverviewStat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start min-w-0">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </div>
        <div className="mt-0.5 text-sm text-gray-900 truncate">{children}</div>
      </div>
    </div>
  );
}
