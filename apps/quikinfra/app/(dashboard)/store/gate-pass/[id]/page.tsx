"use client";

/**
 * Gate Pass — detail page.
 *
 * Mirrors the Material Issue detail layout: a clean text-only overview
 * grid on the left, Approval Timeline + Audit on the right. Submit /
 * Approve / Reject / Quick Close live in the header so the page is
 * the canonical action surface (the list-view icons just deep-link
 * back to here).
 */

import { toErrorMessage } from "@/lib/api/errors";
import React, { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  Send,
  Package,
  Truck,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { PhotoAttachmentsCard } from "@/components/PhotoAttachmentsCard";
import {
  PageHeader,
  PageContainer,
  PageSkeleton,
  StatusChip,
  ApprovalTimeline,
  PrimaryButton,
} from "@/components/PageShell";
import { ApprovalActionBar } from "@/components/ApprovalActionBar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useGatePass } from "@/hooks/use-store";
import { usePermissions, type MeResponse } from "@/hooks/use-permissions";
import { USER_TYPE_CATALOG } from "@/lib/rbac/user-types";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";

import type {
  ApprovalStep,
  ApprovalHistoryEntry,
  ApprovalInfo,
} from "@/lib/approvals/approval-info";
import type { GatePassLine, GatePassDetail } from "@/lib/store/gate-pass-detail";

const REFERENCE_LABEL: Record<string, string> = {
  grn: "GRN",
  material_issue: "Material Issue",
  po: "Purchase Order",
  indent: "Indent",
  transfer: "Stock Transfer",
  return: "Good Return",
  other: "Other",
};

function roleLabel(key: string | null | undefined): string {
  if (!key) return "Any approver";
  return USER_TYPE_CATALOG.find((t) => t.key === key)?.label ?? key;
}

function GatePassStatusChip({ gp }: { gp: GatePassDetail }) {
  const approval = gp?.approval;
  const status = String(gp?.status ?? "draft").toLowerCase();
  if (approval && approval.status === "pending_approval") {
    const step = approval.workflow?.steps?.find(
      (s: ApprovalStep) => s.stepOrder === approval.currentStepOrder,
    );
    const approver = step
      ? step.approverUserName
        ? `${step.approverUserName} (${roleLabel(step.approverRoleId)})`
        : roleLabel(step.approverRoleId)
      : "an approver";
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-amber-50 text-amber-800 border-amber-200">
        Pending — {approver}
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-green-50 text-green-700 border-green-200">
        Approved
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-red-50 text-red-700 border-red-200">
        Rejected
      </span>
    );
  }
  return <StatusChip status={gp?.status ?? "draft"} />;
}

function priorActionByMe(
  me: MeResponse | null | undefined,
  gp: GatePassDetail | null | undefined,
): ApprovalHistoryEntry | null {
  if (!me || !gp?.approval?.history) return null;
  return (
    [...gp.approval.history]
      .reverse()
      .find((h) => h.actionById === me.userId) ?? null
  );
}

/**
 * True when the current user is the workflow's final approver — i.e. the
 * actor on the most recent `approve` history row. Used to gate
 * "Quick Close" so only the person who actually closed the chain (not
 * anyone with `isApproved`) sees the wrap-up button.
 *
 * Falls back to the denormalised `gp.approvedBy` field when the history
 * is empty (e.g. all steps auto-skipped because the raiser was the
 * approver and the API didn't write history rows for the skips).
 */
function wasFinalApprover(
  me: MeResponse | null | undefined,
  gp: GatePassDetail | null | undefined,
): boolean {
  if (!me?.userId || !gp) return false;
  if (gp.approval?.status !== "approved") return false;
  const history = Array.isArray(gp.approval?.history) ? gp.approval.history : [];
  const lastApprove = [...history]
    .reverse()
    .find((h) => h.action === "approve");
  if (lastApprove?.actionById) return lastApprove.actionById === me.userId;
  if (gp.approvedBy) return gp.approvedBy === me.userId;
  return false;
}

function canActOnCurrentStep(
  me: MeResponse | null | undefined,
  gp: GatePassDetail | null | undefined,
): boolean {
  if (!me || !gp?.approval) return false;
  if (gp.approval.status !== "pending_approval") return false;
  const step = gp.approval.workflow?.steps?.find(
    (s: ApprovalStep) => s.stepOrder === gp.approval?.currentStepOrder,
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
    gp.projectId ?? null,
  );
}

function fmtQty(v: unknown, unit?: string | null) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ""}`;
}
function fmtInr(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
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

function TypeBadge({ type }: { type: string }) {
  const t = String(type ?? "").toLowerCase();
  if (t === "inward") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200">
        <ArrowRight className="w-3 h-3" /> Inward
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200">
        <ArrowLeft className="w-3 h-3" /> Outward
      </span>
      {(t === "returnable" || t === "non_returnable") && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold text-gray-700 bg-gray-100 border border-gray-200 uppercase tracking-wide">
          {t === "returnable" ? "Returnable" : "Non-Ret."}
        </span>
      )}
    </span>
  );
}

export default function GatePassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: gp, isLoading } = useGatePass(id);
  const { me } = usePermissions();

  // Submit dialog (separate copy from Approve/Reject which the
  // ApprovalActionBar handles internally).
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitPending, setSubmitPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Quick Close dialog state — shown for approved/issued gate passes
  // so the user can wrap up the row from the detail page too.
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closePending, setClosePending] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const handleSubmit = () => {
    setSubmitError(null);
    setSubmitConfirmOpen(true);
  };

  const doSubmit = async () => {
    setSubmitError(null);
    setSubmitPending(true);
    try {
      const res = await fetch(`/api/store/gate-passes/${id}/submit`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      qc.invalidateQueries({ queryKey: ["gate-pass", id] });
      qc.invalidateQueries({ queryKey: ["gate-passes"] });
      setSubmitConfirmOpen(false);
    } catch (err: unknown) {
      setSubmitError(toErrorMessage(err, "Failed to submit for approval"));
    } finally {
      setSubmitPending(false);
    }
  };

  const doClose = async () => {
    setCloseError(null);
    setClosePending(true);
    try {
      const res = await fetch(`/api/store/gate-passes/${id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      qc.invalidateQueries({ queryKey: ["gate-pass", id] });
      qc.invalidateQueries({ queryKey: ["gate-passes"] });
      setCloseConfirmOpen(false);
    } catch (err: unknown) {
      setCloseError(toErrorMessage(err, "Failed to close gate pass"));
    } finally {
      setClosePending(false);
    }
  };

  const lines: GatePassLine[] = useMemo(
    () => (Array.isArray(gp?.lines) ? gp.lines : []),
    [gp],
  );

  const totals = useMemo(() => {
    let totalQty = 0;
    for (const l of lines) {
      const q = Number(l.quantity ?? l.qty ?? 0);
      if (Number.isFinite(q)) totalQty += q;
    }
    return { totalQty };
  }, [lines]);

  if (isLoading) return <PageSkeleton />;
  if (!gp) {
    return (
      <>
        <PageHeader
          title="Gate Pass"
          breadcrumbs={[
            { label: "Store", href: "/store" },
            { label: "Gate Pass", href: "/store/gate-pass" },
            { label: id },
          ]}
          onBack={() => router.push("/store/gate-pass")}
        />
        <PageContainer>
          <p className="text-gray-500 py-12 text-center">Gate Pass not found.</p>
        </PageContainer>
      </>
    );
  }

  const status = String(gp.status ?? "draft").toLowerCase();
  const isApproved = status === "approved" || status === "issued";

  const approvalEntries =
    gp.approval?.history?.map((h: ApprovalHistoryEntry) => ({
      step: h.stepOrder,
      action: h.action,
      actionBy: h.actionByName ?? "User",
      actionAt: h.actionAt ? fmtDateTime(h.actionAt) : "",
      comments: h.comments ?? undefined,
    })) ?? [];

  const myPriorAction = priorActionByMe(me, gp);

  return (
    <>
      <PageHeader
        title={gp.gatePassNumber ?? `Gate Pass ${id}`}
        subtitle={`Gate Pass — ${gp.projectName ?? "—"}`}
        breadcrumbs={[
          { label: "Store", href: "/store" },
          { label: "Gate Pass", href: "/store/gate-pass" },
          { label: gp.gatePassNumber ?? id },
        ]}
        onBack={() => router.push("/store/gate-pass")}
        actions={
          <div className="flex items-center gap-2">
            <GatePassStatusChip gp={gp} />
            {status === "draft" && (
              <PrimaryButton
                onClick={handleSubmit}
                disabled={submitPending}
              >
                <Send className="w-4 h-4" /> Submit for Approval
              </PrimaryButton>
            )}
            {isApproved && wasFinalApprover(me, gp) && (
              <PrimaryButton
                onClick={() => {
                  setCloseError(null);
                  setCloseConfirmOpen(true);
                }}
                disabled={closePending}
              >
                <CheckCircle2 className="w-4 h-4" /> Quick Close
              </PrimaryButton>
            )}
            {(() => {
              const canAct = canActOnCurrentStep(me, gp);
              if (!canAct && myPriorAction) {
                const label =
                  myPriorAction.action === "approve"
                    ? `You approved at Step ${myPriorAction.stepOrder}`
                    : myPriorAction.action === "reject"
                      ? `You rejected at Step ${myPriorAction.stepOrder}`
                      : `You returned at Step ${myPriorAction.stepOrder}`;
                const tone =
                  myPriorAction.action === "approve"
                    ? "bg-green-50 text-green-700 border-green-200"
                    : myPriorAction.action === "reject"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-orange-50 text-orange-700 border-orange-200";
                return (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border ${tone}`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> {label}
                  </span>
                );
              }
              return (
                <ApprovalActionBar
                  entityType="gatePass"
                  entityId={id}
                  currentStatus={gp.status ?? undefined}
                  requiredPermission="store.gate_pass.approve"
                  actionEndpoint={`/api/store/gate-passes/${id}/approve`}
                  invalidateKeys={[
                    ["gate-passes"],
                    ["gate-pass", id],
                  ]}
                  hidden={!canAct}
                />
              );
            })()}
          </div>
        }
      />

      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-6">
            {/* Overview card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-5">
              <div className="flex items-center gap-3 mb-5">
                <span
                  className={`w-9 h-9 rounded-md flex items-center justify-center ${
                    String(gp.type ?? "").toLowerCase() === "inward"
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                      : "bg-rose-50 text-rose-600 border border-rose-200"
                  }`}
                >
                  <Truck className="w-5 h-5" />
                </span>
                <div>
                  <div className="text-sm font-mono font-semibold text-gray-900">
                    {gp.gatePassNumber ?? "—"}
                  </div>
                  <div className="mt-0.5">
                    <TypeBadge type={gp.type ?? ""} />
                  </div>
                </div>
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-5 text-sm">
                <Stat label="Project">{gp.projectName ?? "—"}</Stat>
                <Stat label="Location">{gp.locationName ?? "—"}</Stat>
                <Stat label="Date">{fmtDate(gp.gatePassDate)}</Stat>
                <Stat label="Status">
                  <StatusChip status={gp.status ?? "draft"} />
                </Stat>

                <Stat label="Reference Type">
                  {REFERENCE_LABEL[gp.referenceType ?? ""] ?? "—"}
                </Stat>
                <Stat label="Reference No." mono>
                  {gp.referenceNo || "—"}
                </Stat>
                <Stat label="Challan No." mono>
                  {gp.challanNo || "—"}
                </Stat>
                {gp.expectedReturnDate && (
                  <Stat label="Expected Return">
                    {fmtDate(gp.expectedReturnDate)}
                  </Stat>
                )}

                <Stat label="Vehicle No." mono>
                  {gp.vehicleNo || "—"}
                </Stat>
                <Stat label="Driver">{gp.driverName || "—"}</Stat>
                <Stat label="Driver Mobile" mono>
                  {gp.driverMobileNo || "—"}
                </Stat>
                {gp.weighbridgeReading && (
                  <Stat label="Weighbridge (MT)">
                    {fmtQty(gp.weighbridgeReading)}
                  </Stat>
                )}

                <Stat label="Security Guard">{gp.securityGuard || "—"}</Stat>
                <Stat label="Material Condition">
                  {gp.materialCondition?.replace(/_/g, " ") || "—"}
                </Stat>
                <Stat label="Items">
                  {lines.length || gp.lineCount || 0}
                </Stat>
                {(gp.transactionAmount ?? 0) > 0 && (
                  <Stat label="Transaction Amount" strong>
                    {fmtInr(gp.transactionAmount)}
                  </Stat>
                )}
              </dl>

              {(gp.purpose || gp.remarks || gp.vehiclePhoto) && (
                <div className="mt-5 pt-5 border-t border-gray-100 space-y-4">
                  {gp.purpose && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                        Purpose
                      </div>
                      <p className="text-sm text-gray-800 leading-relaxed">
                        {gp.purpose}
                      </p>
                    </div>
                  )}
                  {gp.remarks && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                        Remarks
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {gp.remarks}
                      </p>
                    </div>
                  )}
                  <PhotoAttachmentsCard
                    title="Vehicle Photos"
                    raw={gp.vehiclePhoto}
                    variant="compact"
                  />
                </div>
              )}
            </div>

            {gp.ewayBillNo && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3 text-xs text-gray-700 flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  <AlertTriangle className="w-3 h-3" /> E-Way Bill
                </span>
                <span className="font-mono">{gp.ewayBillNo}</span>
                {gp.intercityTransfer && (
                  <span className="ml-auto text-[10px] text-gray-500">
                    Intercity — exempt threshold
                  </span>
                )}
              </div>
            )}

            {/* Material details table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  Material Details ({lines.length})
                </h2>
              </div>

              {lines.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    No material lines on this gate pass.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 tracking-wider border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-bold w-10">#</th>
                        <th className="px-4 py-3 text-left font-bold">Material</th>
                        <th className="px-4 py-3 text-left font-bold">UOM</th>
                        <th className="px-4 py-3 text-right font-bold">Quantity</th>
                        <th className="px-6 py-3 text-left font-bold">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.map((l: GatePassLine, idx: number) => (
                        <tr
                          key={l.id ?? l.itemId ?? idx}
                          className="hover:bg-indigo-50/20 transition-colors"
                        >
                          <td className="px-4 py-3 text-xs font-mono text-gray-400 tabular-nums">
                            {String(idx + 1).padStart(2, "0")}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">
                              {l.materialDescription ?? l.itemName ?? "—"}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {l.uomCode ? (
                              <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded">
                                {l.uomCode}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                            {fmtQty(l.quantity)}
                          </td>
                          <td className="px-6 py-3 text-xs text-gray-500">
                            {l.remarks ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {totals.totalQty > 0 && (
                      <tfoot className="bg-gray-50 border-t border-gray-200">
                        <tr>
                          <td colSpan={3} className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                            Total
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                            {fmtQty(totals.totalQty)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>

          </div>

          {/* Sidebar — Approval Timeline + Audit */}
          <div className="space-y-5">
            {gp.approval && approvalEntries.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Approval Timeline
                  </h3>
                </div>
                <div className="px-5 py-4">
                  <ApprovalTimeline entries={approvalEntries} />
                </div>
              </div>
            )}

            {status === "rejected" && gp.rejectionReason && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-800">
                <div className="font-semibold mb-1">Rejection reason</div>
                <div>{gp.rejectionReason}</div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Audit</h3>
              </div>
              <dl className="space-y-3 text-xs">
                <AuditField label="Created" value={fmtDateTime(gp.createdAt)} />
                <AuditField
                  label="Created By"
                  value={gp.createdByName ?? gp.createdBy ?? "—"}
                />
                <AuditField label="Updated" value={fmtDateTime(gp.updatedAt)} />
                <AuditField
                  label="Updated By"
                  value={gp.updatedByName ?? gp.updatedBy ?? "—"}
                />
                {(gp.approvedByName ?? gp.approvedBy) && (
                  <AuditField
                    label="Approved By"
                    value={gp.approvedByName ?? gp.approvedBy}
                  />
                )}
                {gp.closedAt && (
                  <AuditField label="Closed At" value={fmtDateTime(gp.closedAt)} />
                )}
              </dl>
            </div>
          </div>
        </div>
      </PageContainer>

      <ConfirmDialog
        open={submitConfirmOpen}
        onClose={() => {
          if (!submitPending) {
            setSubmitConfirmOpen(false);
            setSubmitError(null);
          }
        }}
        onConfirm={doSubmit}
        title="Submit for Approval"
        confirmLabel="Submit"
        tone="primary"
        loading={submitPending}
        message={
          <>
            Submit Gate Pass{" "}
            <span className="font-semibold text-gray-900">
              {gp.gatePassNumber ?? id}
            </span>{" "}
            for approval? It will be routed through the active Gate Pass
            workflow and you won&apos;t be able to edit it until an approver
            actions it.
            {submitError && (
              <span className="mt-3 block rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {submitError}
              </span>
            )}
          </>
        }
      />

      <ConfirmDialog
        open={closeConfirmOpen}
        onClose={() => {
          if (!closePending) {
            setCloseConfirmOpen(false);
            setCloseError(null);
          }
        }}
        onConfirm={doClose}
        title="Close Gate Pass"
        confirmLabel="Close"
        tone="primary"
        loading={closePending}
        message={
          <>
            Mark gate pass{" "}
            <span className="font-semibold text-gray-900">
              {gp.gatePassNumber ?? id}
            </span>{" "}
            as closed? Use this once the material movement is complete (or
            the returnable item is back on site).
            {closeError && (
              <span className="mt-3 block rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {closeError}
              </span>
            )}
          </>
        }
      />
    </>
  );
}

function Stat({
  label,
  children,
  mono,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div
        className={`mt-1 text-sm text-gray-900 truncate ${mono ? "font-mono text-xs" : ""} ${
          strong ? "font-semibold" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function AuditField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className="mt-0.5 text-gray-800">{value ?? "—"}</div>
    </div>
  );
}
