"use client";

/**
 * Stock Reconciliation — detail page.
 *
 * Read-only view modelled on the Material Issue detail layout: overview
 * grid on the left, audit card on the right. No approval timeline yet
 * because the reconciliation submit/approve routes haven't been wired —
 * when they are, drop in the same ApprovalTimeline block PR / MI use.
 */

import { toErrorMessage } from "@/lib/api/errors";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Package, Send, Check, X as XIcon } from "lucide-react";
import {
  PageHeader,
  PageContainer,
  PageSkeleton,
  StatusChip,
  ApprovalTimeline,
  PrimaryButton,
} from "@/components/PageShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  useStockReconciliation,
  useSubmitStockReconciliation,
  useApproveStockReconciliation,
} from "@/hooks/use-store";
import { usePermissions } from "@/hooks/use-permissions";
import { RepairApprovalNotice } from "@/components/RepairApprovalNotice";
import { MasterApprovalAction } from "@/components/MasterApprovalAction";
import { USER_TYPE_CATALOG } from "@/lib/rbac/user-types";

function roleLabel(key: string | null | undefined): string {
  if (!key) return "Any approver";
  return USER_TYPE_CATALOG.find((t) => t.key === key)?.label ?? key;
}

import type {
  ApprovalStep,
  ApprovalHistoryEntry,
} from "@/lib/approvals/approval-info";
import type { ReconLine, ReconciliationDetail } from "@/lib/store/stock-reconciliation-detail";

/** Matches PageShell's ApprovalTimeline entry shape. */
interface TimelineEntry {
  step: number;
  action: string;
  actionBy: string;
  actionAt: string;
  comments?: string;
  title?: string;
}

function fmtQty(v: unknown, unit?: string | null) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: 4 })}${
    unit ? ` ${unit}` : ""
  }`;
}

function fmtDate(v: unknown): string {
  if (!v) return "—";
  try {
    const d = new Date(v as string | number | Date);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(v);
  }
}

function fmtDateTime(v: unknown): string {
  if (!v) return "—";
  try {
    const d = new Date(v as string | number | Date);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return String(v);
  }
}

export default function ReconciliationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: recon, isLoading } = useStockReconciliation(id);
  const submitMutation = useSubmitStockReconciliation();
  const approveMutation = useApproveStockReconciliation();
  const { isSuper, me } = usePermissions();

  // Workflow action modal — same pattern PR / MI / Estimation use.
  const [workflowAction, setWorkflowAction] = useState<
    "submit" | "approve" | "reject" | null
  >(null);
  const [rejectReason, setRejectReason] = useState("");
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const workflowPending = submitMutation.isPending || approveMutation.isPending;

  const openWorkflow = (kind: "submit" | "approve" | "reject") => {
    setRejectReason("");
    setWorkflowError(null);
    setWorkflowAction(kind);
  };
  const closeWorkflow = () => {
    if (workflowPending) return;
    setWorkflowAction(null);
    setRejectReason("");
    setWorkflowError(null);
  };
  const runWorkflowAction = async () => {
    if (!workflowAction) return;
    setWorkflowError(null);
    try {
      if (workflowAction === "submit") {
        await submitMutation.mutateAsync(id);
      } else {
        await approveMutation.mutateAsync({
          id,
          action: workflowAction === "approve" ? "approve" : "reject",
          comments:
            workflowAction === "reject" ? rejectReason.trim() : undefined,
        });
      }
      qc.invalidateQueries({ queryKey: ["stock-reconciliation", id] });
      qc.invalidateQueries({ queryKey: ["stock-reconciliations"] });
      setWorkflowAction(null);
      setRejectReason("");
    } catch (err: unknown) {
      setWorkflowError(toErrorMessage(err, "Action failed"));
    }
  };

  if (isLoading) return <PageSkeleton />;
  if (!recon) {
    return (
      <>
        <PageHeader
          title="Stock Reconciliation"
          breadcrumbs={[
            { label: "Store", href: "/store" },
            { label: "Reconciliation", href: "/store/reconciliation" },
            { label: id },
          ]}
          onBack={() => router.push("/store/reconciliation")}
        />
        <PageContainer>
          <p className="text-gray-500 py-12 text-center">
            Reconciliation not found.
          </p>
        </PageContainer>
      </>
    );
  }

  const lines: ReconLine[] = Array.isArray(recon.lines) ? recon.lines : [];
  const status = String(recon.status ?? "draft").toLowerCase();
  const isDraft = status === "draft";
  const isPending = status === "pending_approval";
  const canApprove =
    isSuper || recon?.approval?.canActOnCurrentStep === true;

  // Map approval history into the shape the shared ApprovalTimeline
  // component expects: `step`, `actionBy`, `actionAt` as a formatted
  // string. Matching the field names is what other detail pages were
  // missing earlier — keep this in sync if those change.
  const approvalEntries =
    recon.approval?.history?.map((h: ApprovalHistoryEntry) => ({
      step: h.stepOrder,
      action: h.action,
      actionBy: h.actionByName ?? "User",
      actionAt: h.actionAt ? fmtDateTime(h.actionAt) : "",
      comments: h.comments,
    })) ?? [];

  return (
    <>
      <PageHeader
        title={recon.reconciliationNumber ?? `Reconciliation ${id}`}
        subtitle={`Stock Reconciliation — ${recon.projectName ?? ""}`}
        breadcrumbs={[
          { label: "Store", href: "/store" },
          { label: "Reconciliation", href: "/store/reconciliation" },
          { label: recon.reconciliationNumber ?? id },
        ]}
        onBack={() => router.push("/store/reconciliation")}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip status={recon.status ?? "draft"} />
            {isDraft && (
              <PrimaryButton
                onClick={() => openWorkflow("submit")}
                disabled={workflowPending}
              >
                <Send className="w-4 h-4" /> Submit for Approval
              </PrimaryButton>
            )}
            {isPending && canApprove && (
              <>
                <PrimaryButton
                  onClick={() => openWorkflow("approve")}
                  disabled={workflowPending}
                >
                  <Check className="w-4 h-4" /> Approve
                </PrimaryButton>
                <button
                  type="button"
                  onClick={() => openWorkflow("reject")}
                  disabled={workflowPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 disabled:opacity-50"
                >
                  <XIcon className="w-4 h-4" /> Reject
                </button>
              </>
            )}
            <MasterApprovalAction
              approval={recon?.approval}
              me={me}
              entityLabel="reconciliation"
              actionEndpoint={`/api/store/reconciliations/${id}/approve`}
              invalidateKeys={[["reconciliations"], ["reconciliation", id]]}
            />
            {isPending && !canApprove && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border bg-amber-50 text-amber-700 border-amber-200">
                Awaiting approver
              </span>
            )}
          </div>
        }
      />

      <PageContainer>
        <RepairApprovalNotice
          repair={recon?.approval?.repair}
          entityLabel="reconciliation"
          actionEndpoint={`/api/store/reconciliations/${id}/approve`}
          invalidateKeys={[["reconciliations"], ["reconciliation", id]]}
          me={me}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Overview */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Overview</h2>
                <StatusChip status={recon.status ?? "draft"} />
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 px-6 py-5 text-sm">
                <OverviewStat label="Recon No">
                  <span className="text-xs font-semibold text-gray-900 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-100">
                    {recon.reconciliationNumber ?? "—"}
                  </span>
                </OverviewStat>
                <OverviewStat label="Project">
                  <span className="font-medium text-gray-900 truncate">
                    {recon.projectName ?? "—"}
                  </span>
                </OverviewStat>
                <OverviewStat label="Location">
                  <span className="text-gray-900">
                    {recon.locationName ?? "—"}
                  </span>
                </OverviewStat>
                <OverviewStat label="Reconciliation Date">
                  <span className="text-gray-900">
                    {fmtDate(recon.reconciliationDate)}
                  </span>
                </OverviewStat>
                <OverviewStat label="Conducted By">
                  <span className="text-gray-900">
                    {recon.conductedByName ?? recon.conductedById ?? "—"}
                  </span>
                </OverviewStat>
                <OverviewStat label="Lines">
                  <span className="font-medium text-gray-900 tabular-nums">
                    {recon.lineCount ?? lines.length}
                  </span>
                </OverviewStat>
              </dl>
            </div>

            {/* Lines table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  Reconciliation Items
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                  {lines.length} line{lines.length === 1 ? "" : "s"}
                </span>
              </div>

              {lines.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No lines on this reconciliation.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 tracking-wider border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-bold w-10">#</th>
                        <th className="px-4 py-3 text-left font-bold">Material</th>
                        <th className="px-4 py-3 text-right font-bold">System Qty</th>
                        <th className="px-4 py-3 text-right font-bold">Physical Qty</th>
                        <th className="px-4 py-3 text-right font-bold">Variance</th>
                        <th className="px-6 py-3 text-left font-bold">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.map((l) => {
                        const variance = Number(l.varianceQty ?? 0);
                        const positive = variance > 0;
                        const negative = variance < 0;
                        return (
                          <tr key={l.id ?? l.lineNo} className="hover:bg-indigo-50/20 transition-colors">
                            <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">
                              {String(l.lineNo).padStart(2, "0")}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">
                                  {l.itemName ?? l.itemId ?? "—"}
                                </span>
                                {l.uomCode && (
                                  <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded">
                                    {l.uomCode}
                                  </span>
                                )}
                              </div>
                              {l.itemCode && (
                                <div className="text-[10px] text-gray-500 mt-0.5">
                                  {l.itemCode}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                              {fmtQty(l.systemQty, l.uomCode)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                              {fmtQty(l.physicalQty, l.uomCode)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              <span
                                className={
                                  positive
                                    ? "inline-flex items-center text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded"
                                    : negative
                                      ? "inline-flex items-center text-[11px] font-medium text-rose-700 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded"
                                      : "text-gray-400"
                                }
                              >
                                {variance === 0 ? "—" : fmtQty(variance, l.uomCode)}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-gray-700">
                              {l.reason || <span className="text-gray-400">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar — Approval Timeline + Audit */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Approval Timeline
              </h3>
              {!recon.approval ? (
                <p className="text-sm text-gray-500">
                  Not yet submitted for approval.
                </p>
              ) : (
                (() => {
                  const approval = recon.approval!;
                  const entries: TimelineEntry[] = [
                    {
                      step: 0,
                      action: "request",
                      title: "Requested",
                      actionBy: approval.requestedByName || "Requester",
                      actionAt: fmtDateTime(approval.requestedAt),
                    },
                  ];

                  (approval.workflow?.steps ?? []).forEach((s: ApprovalStep) => {
                    const acted = [...(approval.history ?? [])]
                      .reverse()
                      .find((h) => h.stepOrder === s.stepOrder);
                    const approverLabel = s.approverUserName
                      ? `${s.approverUserName} (${roleLabel(s.approverRoleId)})`
                      : roleLabel(s.approverRoleId);

                    if (acted) {
                      entries.push({
                        step: s.stepOrder,
                        action: acted.action,
                        actionBy: acted.actionByName || approverLabel,
                        actionAt: fmtDateTime(acted.actionAt),
                        comments: acted.comments || undefined,
                      });
                      return;
                    }

                    const isCurrent =
                      approval.status === "pending_approval" &&
                      approval.currentStepOrder === s.stepOrder;
                    entries.push({
                      step: s.stepOrder,
                      action: isCurrent ? "current" : "upcoming",
                      title: isCurrent
                        ? `Next — Step ${s.stepOrder}`
                        : `Upcoming — Step ${s.stepOrder}`,
                      actionBy: approverLabel,
                      actionAt: isCurrent
                        ? "Awaiting action"
                        : "Not yet reached",
                    });
                  });

                  return <ApprovalTimeline entries={entries} />;
                })()
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Audit</h3>
              <div className="space-y-3 text-xs">
                <AuditField label="Created">
                  {fmtDateTime(recon.createdAt)}
                </AuditField>
                <AuditField label="Created By">
                  {recon.createdByName ?? recon.createdBy ?? "—"}
                </AuditField>
                {recon.updatedAt && (
                  <AuditField label="Last Updated">
                    {fmtDateTime(recon.updatedAt)}
                  </AuditField>
                )}
                {(recon.updatedByName || recon.updatedBy) && (
                  <AuditField label="Last Updated By">
                    {recon.updatedByName ?? recon.updatedBy}
                  </AuditField>
                )}
                {(recon.approvedByName || recon.approvedById) && (
                  <AuditField label="Approved By">
                    {recon.approvedByName ?? recon.approvedById}
                  </AuditField>
                )}
              </div>
            </div>
          </div>
        </div>
      </PageContainer>

      <ConfirmDialog
        open={!!workflowAction}
        onClose={closeWorkflow}
        onConfirm={runWorkflowAction}
        loading={workflowPending}
        tone={workflowAction === "reject" ? "danger" : "primary"}
        title={
          workflowAction === "submit"
            ? "Submit for Approval"
            : workflowAction === "approve"
              ? "Approve Reconciliation"
              : workflowAction === "reject"
                ? "Reject Reconciliation"
                : ""
        }
        confirmLabel={
          workflowAction === "submit"
            ? "Submit"
            : workflowAction === "approve"
              ? "Approve"
              : "Reject"
        }
        message={
          workflowAction ? (
            <div className="space-y-3">
              <div>
                {workflowAction === "submit" && (
                  <>
                    Send reconciliation{" "}
                    <span className="font-semibold text-gray-900">
                      {recon.reconciliationNumber ?? ""}
                    </span>{" "}
                    into the approval queue?
                  </>
                )}
                {workflowAction === "approve" && (
                  <>
                    Approve reconciliation{" "}
                    <span className="font-semibold text-gray-900">
                      {recon.reconciliationNumber ?? ""}
                    </span>
                    ?
                  </>
                )}
                {workflowAction === "reject" && (
                  <>
                    Reject reconciliation{" "}
                    <span className="font-semibold text-gray-900">
                      {recon.reconciliationNumber ?? ""}
                    </span>
                    ?
                  </>
                )}
              </div>
              {workflowAction === "reject" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Reason
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    placeholder="e.g. physical count looks off, please re-verify"
                    disabled={workflowPending}
                    autoFocus
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:bg-gray-50"
                  />
                </div>
              )}
              {workflowError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {workflowError}
                </div>
              )}
            </div>
          ) : null
        }
      />
    </>
  );
}

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

function AuditField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className="mt-0.5 text-gray-900">{children}</div>
    </div>
  );
}
