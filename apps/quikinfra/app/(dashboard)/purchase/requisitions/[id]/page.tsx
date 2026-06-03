"use client";

/**
 * Purchase Requisition — detail page.
 *
 * Reads PR line fields with a fallback chain so it renders correctly
 * whether the line was persisted by the OLD `buildMRLines` (which wrote
 * `qtyRequired` and `estimatedAmount` based on the item master) or the
 * NEW one (which aliases `quantity` + honours user-entered rate).
 *
 * Adds a Stock Availability panel so approvers see per-line stock status
 * at a glance, and when stock is fully available, surfaces a Source
 * Location picker that's passed to the approve endpoint via the
 * ApprovalActionBar's `extraBody` hook — the picked location is then
 * used to prefill the auto-generated Material Issue request.
 */

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Send, CheckCircle2, AlertTriangle, Warehouse } from "lucide-react";
import {
  PageHeader, PageContainer, StatusChip,
  PrimaryButton, ApprovalTimeline, PageSkeleton,
} from "@/components/PageShell";
import { ApprovalActionBar } from "@/components/ApprovalActionBar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SelectInput } from "@/components/FormDrawer";
import { usePurchaseRequisition, useSubmitPR } from "@/hooks/use-purchase";
import { useLocations } from "@/hooks/use-masters";
import { usePermissions } from "@/hooks/use-permissions";
import { USER_TYPE_CATALOG } from "@/lib/rbac/user-types";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";

/** Human-readable label for a userType key stored in workflow steps. */
function roleLabel(key: string | null | undefined): string {
  if (!key) return "Any approver";
  return USER_TYPE_CATALOG.find((t) => t.key === key)?.label ?? key;
}

/**
 * PRStatusChip — the single chip shown at the top of the detail page.
 * While the PR is mid-flow, reads as `Pending — {next approver}` so
 * requesters / earlier approvers see who's sitting on it without
 * opening the timeline. Collapses to plain Approved (green) /
 * Rejected (red) when the flow ends, or the shared StatusChip for
 * draft / returned.
 */
function PRStatusChip({ pr }: { pr: any }) {
  const approval = pr?.approval;
  const status = pr?.status;

  if (approval && approval.status === "pending_approval") {
    const step = approval.workflow?.steps?.find(
      (s: any) => s.stepOrder === approval.currentStepOrder,
    );
    const approver = step
      ? step.approverUserName
        ? `${step.approverUserName} (${roleLabel(step.approverRoleId)})`
        : roleLabel(step.approverRoleId)
      : "an approver";
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-amber-50 text-amber-800 border-amber-200">
        Pending — {approver}
      </span>
    );
  }

  if (
    status === "approved" ||
    status === "approved_stock_available" ||
    status === "approved_indent_required"
  ) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">
        Approved
      </span>
    );
  }

  if (status === "rejected") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-rose-50 text-rose-700 border-rose-200">
        Rejected
      </span>
    );
  }

  return <StatusChip status={status} />;
}

/**
 * Returns the most recent history row where the current user acted —
 * used to render a "You already approved at step N" indicator in place
 * of the live action buttons for users who've moved past their step.
 */
function priorActionByMe(me: any, pr: any): any | null {
  if (!me || !pr?.approval?.history) return null;
  return (
    [...pr.approval.history]
      .reverse()
      .find((h: any) => h.actionById === me.userId) ?? null
  );
}

/**
 * True when the logged-in user is the expected actor for the current
 * step. Mirrors the server-side canActOnStep exactly so the UI hides
 * the action bar unless the viewer is actually allowed to act.
 */
function canActOnCurrentStep(me: any, pr: any): boolean {
  if (!me || !pr?.approval) return false;
  if (pr.approval.status !== "pending_approval") return false;
  const step = pr.approval.workflow?.steps?.find(
    (s: any) => s.stepOrder === pr.approval.currentStepOrder,
  );
  if (!step) return false;
  return canActOnStep(
    {
      userId: me.userId,
      roleKey: me.roleKey,
      projectIds:
        me.projectIds === null || me.projectIds === undefined
          ? undefined
          : me.projectIds,
    },
    {
      approverUserId: step.approverUserId ?? null,
      approverRoleId: step.approverRoleId ?? null,
    },
    pr.projectId ?? null,
  );
}

// Pull a quantity out of a line regardless of which writer produced it.
function lineQty(line: any): number {
  const raw =
    line?.quantity ??
    line?.qtyRequired ??
    line?.qtyRequested ??
    line?.orderedQty ??
    0;
  return parseFloat(String(raw)) || 0;
}
function lineRate(line: any): number {
  const raw = line?.estimatedRate ?? line?.unitRate ?? line?.rate ?? 0;
  return parseFloat(String(raw)) || 0;
}
function lineAmount(line: any): number {
  const raw = line?.estimatedAmount ?? line?.amount ?? line?.totalAmount;
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    return parseFloat(String(raw)) || 0;
  }
  return lineQty(line) * lineRate(line);
}

const STOCK_BADGE: Record<string, string> = {
  AVAILABLE:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  PARTIAL:      "bg-amber-50 text-amber-700 border-amber-200",
  INSUFFICIENT: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function PRDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: pr, isLoading } = usePurchaseRequisition(id);
  const submitMutation = useSubmitPR();
  const { me } = usePermissions();

  const [sourceLocationId, setSourceLocationId] = useState("");
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const lines: any[] = useMemo(() => pr?.lines ?? [], [pr]);
  const estimatedTotal = useMemo(() => {
    if (lines.length > 0) {
      return lines.reduce((sum: number, l: any) => sum + lineAmount(l), 0);
    }
    return parseFloat(pr?.estimatedTotal ?? "0") || 0;
  }, [lines, pr?.estimatedTotal]);

  // Per-project location list — only needed when approver must pick a
  // source location. Scoped to the PR's project so the approver doesn't
  // see unrelated stores.
  const { data: locData } = useLocations(
    pr?.projectId ? { projectId: pr.projectId } : undefined
  );
  const locations = locData?.data ?? [];

  // Stock rollup — prefer the summary the POST handler stored, but derive
  // it per line so we can render a badge in each row.
  const stockSummary = (pr?.stockCheckSummary ?? "").toString();
  const stockRollup = useMemo(() => {
    let available = 0;
    let partial = 0;
    let insufficient = 0;
    for (const l of lines) {
      const s = String(l.stockCheckStatus ?? "").toUpperCase();
      if (s === "AVAILABLE") available++;
      else if (s === "PARTIAL") partial++;
      else if (s === "INSUFFICIENT") insufficient++;
    }
    return { available, partial, insufficient, total: lines.length };
  }, [lines]);

  const allAvailable =
    stockSummary === "ALL_AVAILABLE" ||
    (lines.length > 0 && stockRollup.available === lines.length);

  if (isLoading) return <PageSkeleton />;
  if (!pr) {
    return (
      <PageContainer>
        <p className="text-slate-500 py-12 text-center">PR not found</p>
      </PageContainer>
    );
  }

  const isPendingApproval =
    String(pr.status ?? "").toLowerCase() === "pending_approval" ||
    String(pr.status ?? "").toLowerCase() === "submitted";

  const handleSubmit = () => {
    setSubmitError(null);
    setSubmitConfirmOpen(true);
  };

  const doSubmit = async () => {
    try {
      await submitMutation.mutateAsync(id);
      setSubmitConfirmOpen(false);
    } catch (err: any) {
      // Keep the modal open so the user can read the failure reason.
      setSubmitError(err?.message ?? "Failed to submit PR");
    }
  };

  return (
    <>
      <PageHeader
        title={pr.mrNumber ?? pr.prNumber ?? `MR ${id}`}
        subtitle={`Purchase Requisition — ${pr.projectName ?? "—"}`}
        breadcrumbs={[
          { label: "Purchase", href: "/purchase" },
          { label: "Purchase Requisitions", href: "/purchase/requisitions" },
          { label: pr.mrNumber ?? pr.prNumber ?? id },
        ]}
        onBack={() => router.push("/purchase/requisitions")}
        actions={
          <div className="flex items-center gap-2">
            <PRStatusChip pr={pr} />
            {pr.status === "draft" && pr.createdBy && me?.userId === pr.createdBy && (
              <PrimaryButton onClick={handleSubmit} disabled={submitMutation.isPending}>
                <Send className="w-4 h-4" /> Submit for Approval
              </PrimaryButton>
            )}
            {(() => {
              const canAct = canActOnCurrentStep(me, pr);
              const prior = !canAct ? priorActionByMe(me, pr) : null;
              // If the viewer already acted at an earlier step, show a
              // compact non-clickable confirmation in place of buttons
              // so they get feedback that their prior approval was
              // recorded — but cannot re-approve.
              if (prior) {
                const label =
                  prior.action === "approve"
                    ? `You approved at Step ${prior.stepOrder}`
                    : prior.action === "reject"
                      ? `You rejected at Step ${prior.stepOrder}`
                      : `You returned at Step ${prior.stepOrder}`;
                const tone =
                  prior.action === "approve"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : prior.action === "reject"
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-orange-50 text-orange-700 border-orange-200";
                return (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border ${tone}`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {label}
                  </span>
                );
              }
              return (
                <ApprovalActionBar
                  entityType="mr"
                  entityId={id}
                  currentStatus={pr.status}
                  requiredPermission="purchase.mr.approve"
                  actionEndpoint={`/api/purchase/requisitions/${id}/approve`}
                  invalidateKeys={[
                    ["purchase-requisitions"],
                    ["purchase-requisition", id],
                    ["material-issues"],
                  ]}
                  // When stock is fully available, pass the approver-
                  // picked source location through to the approve route
                  // so the MI draft it auto-creates is scoped to a
                  // warehouse.
                  extraBody={() =>
                    allAvailable && sourceLocationId
                      ? { sourceLocationId }
                      : {}
                  }
                  approveDisabled={allAvailable && !sourceLocationId}
                  approveDisabledReason="Pick a source location before approving"
                  // Workflow-aware gating — opts out of the legacy
                  // `requiredPermission` check. Only the current step's
                  // actor sees live buttons.
                  hidden={!canAct}
                />
              );
            })()}
          </div>
        }
      />

      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Header Info */}
            <div className="relative bg-white rounded-2xl border border-slate-200 shadow-soft p-5 overflow-hidden">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoField label="PR Number" value={pr.prNumber ?? pr.mrNumber} />
                <InfoField label="Project" value={pr.projectName} />
                <InfoField label="Request Date" value={pr.requestDate} />
                <InfoField label="Required Date" value={pr.requiredDate ?? "—"} />
                <InfoField label="Purpose" value={pr.purpose ?? "—"} />
                <InfoField label="Urgent" value={pr.isUrgent ? "Yes" : "No"} />
                <InfoField label="Status" value={<PRStatusChip pr={pr} />} />
                <InfoField
                  label="Estimated Total"
                  value={`₹ ${estimatedTotal.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                  })}`}
                  highlight
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-soft overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <span className="w-1 h-4 rounded-full bg-gradient-to-b from-orange-500 to-orange-600" />
                  Line Items
                </h3>
                <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-0.5">
                  {lines.length || pr.lineCount || 0}
                </span>
              </div>
              {lines.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  {pr.lineCount
                    ? `${pr.lineCount} items (details available in full view)`
                    : "No line items"}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gradient-to-b from-slate-50 to-slate-100/70 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wider w-8">#</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wider">Material</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-600 uppercase tracking-wider w-20">Qty</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wider w-16">UOM</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-600 uppercase tracking-wider w-28">Rate (₹)</th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-600 uppercase tracking-wider w-32">Amount (₹)</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wider w-28">Stock</th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-600 uppercase tracking-wider">Specification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line: any, i: number) => {
                        const qty = lineQty(line);
                        const rate = lineRate(line);
                        const amt = lineAmount(line);
                        const stock = String(line.stockCheckStatus ?? "").toUpperCase();
                        const availStock = Number(line.availableStock ?? line.currentStock ?? 0);
                        return (
                          <tr key={line.id ?? line.lineId ?? i} className="border-t border-slate-100 hover:bg-orange-50/40 transition-colors">
                            <td className="px-4 py-3 text-xs text-slate-400 font-semibold">{i + 1}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                              {line.itemName ?? line.itemId ?? "—"}
                              {line.itemCode && (
                                <span className="ml-2 text-[10px] text-slate-400 font-mono">
                                  {line.itemCode}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-slate-700 tabular-nums">
                              {qty > 0 ? qty.toLocaleString("en-IN") : "—"}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600 uppercase">
                              {line.uomCode ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-slate-700 tabular-nums">
                              {rate > 0 ? `₹ ${rate.toLocaleString("en-IN")}` : "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-slate-900 tabular-nums">
                              {amt > 0
                                ? `₹ ${amt.toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                  })}`
                                : "—"}
                            </td>
                            <td className="px-4 py-3">
                              {stock ? (
                                <div className="flex flex-col gap-0.5">
                                  <span
                                    className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border w-fit ${
                                      STOCK_BADGE[stock] ?? "bg-slate-50 text-slate-600 border-slate-200"
                                    }`}
                                  >
                                    {stock === "AVAILABLE" && <CheckCircle2 className="w-2.5 h-2.5" />}
                                    {stock === "PARTIAL" && <AlertTriangle className="w-2.5 h-2.5" />}
                                    {stock === "INSUFFICIENT" && <AlertTriangle className="w-2.5 h-2.5" />}
                                    {stock}
                                  </span>
                                  <span className="text-[10px] text-slate-500 tabular-nums">
                                    {availStock.toLocaleString("en-IN")} on hand
                                  </span>
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">
                              {line.specification ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-orange-50/50">
                        <td colSpan={5} className="px-4 py-3 text-sm font-bold text-slate-700 text-right uppercase tracking-wider text-[11px]">
                          Total
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-orange-700 text-right tabular-nums">
                          ₹ {estimatedTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Stock Summary */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-soft p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center ring-1 ring-orange-100">
                  <Warehouse className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-semibold text-slate-900">Stock Availability</h3>
              </div>

              {lines.length === 0 ? (
                <p className="text-xs text-slate-500">No line items to check.</p>
              ) : (
                <>
                  <div
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold mb-3 ${
                      allAvailable
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : stockRollup.insufficient > 0
                        ? "bg-rose-50 border-rose-200 text-rose-700"
                        : "bg-amber-50 border-amber-200 text-amber-700"
                    }`}
                  >
                    {allAvailable
                      ? "All items available in stock"
                      : stockRollup.insufficient > 0
                      ? "Procurement required — indent will be raised on approval"
                      : "Partial stock — review line items"}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-2 py-2">
                      <div className="text-base font-bold text-emerald-700 tabular-nums">
                        {stockRollup.available}
                      </div>
                      <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">
                        Available
                      </div>
                    </div>
                    <div className="rounded-lg bg-amber-50 border border-amber-100 px-2 py-2">
                      <div className="text-base font-bold text-amber-700 tabular-nums">
                        {stockRollup.partial}
                      </div>
                      <div className="text-[9px] font-bold uppercase tracking-wider text-amber-600">
                        Partial
                      </div>
                    </div>
                    <div className="rounded-lg bg-rose-50 border border-rose-100 px-2 py-2">
                      <div className="text-base font-bold text-rose-700 tabular-nums">
                        {stockRollup.insufficient}
                      </div>
                      <div className="text-[9px] font-bold uppercase tracking-wider text-rose-600">
                        Short
                      </div>
                    </div>
                  </div>

                  {/* Source location picker — shown only while the PR is
                      pending approval AND stock is fully available, so the
                      approver can choose where to pull from before clicking
                      Approve. The picked location is persisted onto the MI
                      draft auto-created on approval. */}
                  {isPendingApproval && allAvailable && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Source Location
                      </label>
                      <SelectInput
                        value={sourceLocationId}
                        onChange={setSourceLocationId}
                        placeholder="Select location…"
                        options={locations.map((l: any) => ({ value: l.id, label: l.name }))}
                      />
                      <p className="text-[10px] text-slate-500 mt-1.5">
                        Material Issue will be auto-created from this store on
                        approval.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Approval Timeline */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-soft p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-gradient-to-b from-orange-500 to-orange-600" />
                Approval Timeline
              </h3>
              {pr.status === "draft" ? (
                <p className="text-sm text-slate-500">Not yet submitted for approval.</p>
              ) : !pr.approval ? (
                <p className="text-sm text-slate-500">
                  Submitted, but no approval instance is linked to this PR.
                </p>
              ) : (
                (() => {
                  // First row: who submitted the PR.
                  const entries: any[] = [
                    {
                      step: 0,
                      action: "request",
                      title: "Requested",
                      actionBy: pr.approval.requestedByName || "Requester",
                      actionAt: new Date(pr.approval.requestedAt).toLocaleString(),
                    },
                  ];

                  // One row per CONFIGURED step. For each, use the last
                  // matching history row if the step is already completed,
                  // else render it as the current "Next up" pending row or
                  // an "Upcoming" row that comes later in the chain.
                  pr.approval.workflow.steps.forEach((s: any) => {
                    const acted = [...pr.approval.history]
                      .reverse()
                      .find((h: any) => h.stepOrder === s.stepOrder);
                    const approverLabel = s.approverUserName
                      ? `${s.approverUserName} (${roleLabel(s.approverRoleId)})`
                      : roleLabel(s.approverRoleId);

                    if (acted) {
                      entries.push({
                        step: s.stepOrder,
                        action: acted.action, // approve | reject | return
                        actionBy: acted.actionByName || approverLabel,
                        actionAt: new Date(acted.actionAt).toLocaleString(),
                        comments: acted.comments || undefined,
                      });
                      return;
                    }

                    const isCurrent =
                      pr.approval.status === "pending_approval" &&
                      pr.approval.currentStepOrder === s.stepOrder;
                    entries.push({
                      step: s.stepOrder,
                      action: isCurrent ? "current" : "upcoming",
                      title: isCurrent
                        ? `Next — Step ${s.stepOrder}`
                        : `Upcoming — Step ${s.stepOrder}`,
                      actionBy: approverLabel,
                      actionAt: isCurrent ? "Awaiting action" : "Not yet reached",
                    });
                  });
                  return <ApprovalTimeline entries={entries} />;
                })()
              )}
            </div>

            {/* Audit */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-soft p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-gradient-to-b from-orange-500 to-orange-600" />
                Audit
              </h3>
              <div className="space-y-2">
                <InfoField
                  label="Created"
                  value={pr.createdAt ? new Date(pr.createdAt).toLocaleString() : "—"}
                />
                <InfoField
                  label="Created By"
                  value={pr.createdByName ?? pr.createdBy ?? "—"}
                />
              </div>
            </div>
          </div>
        </div>
      </PageContainer>

      <ConfirmDialog
        open={submitConfirmOpen}
        onClose={() => {
          if (!submitMutation.isPending) {
            setSubmitConfirmOpen(false);
            setSubmitError(null);
          }
        }}
        onConfirm={doSubmit}
        title="Submit for Approval"
        confirmLabel="Submit"
        tone="primary"
        loading={submitMutation.isPending}
        message={
          <>
            Submit PR{" "}
            <span className="font-semibold text-slate-900">
              {pr.prNumber ?? pr.mrNumber ?? id}
            </span>{" "}
            for approval? It will be routed through the active Purchase
            Requisition workflow and you won't be able to edit it until an
            approver returns it.
            {submitError && (
              <span className="mt-3 block rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {submitError}
              </span>
            )}
          </>
        }
      />
    </>
  );
}

function InfoField({
  label,
  value,
  highlight,
}: {
  label: string;
  value: any;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
        {label}
      </p>
      <div
        className={`text-sm mt-0.5 ${
          highlight ? "font-bold text-orange-700 tabular-nums" : "text-slate-800"
        }`}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}
