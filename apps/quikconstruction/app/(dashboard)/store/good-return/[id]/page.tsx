"use client";

/**
 * Good Return — detail page.
 *
 * Same layout as the Material Issue / Gate Pass detail pages: a clean
 * text-only overview grid on the left, Approval Timeline + Audit on
 * the right. Submit / Approve / Reject / Dispatch live in the header
 * so this page is the canonical action surface (the list-view icons
 * just deep-link back to here).
 */

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
  PackageX,
} from "lucide-react";
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
import { useGoodReturn } from "@/hooks/use-store";
import { usePermissions } from "@/hooks/use-permissions";
import { USER_TYPE_CATALOG } from "@/lib/rbac/user-types";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";

const REASON_LABEL: Record<string, string> = {
  damaged: "Damaged",
  rejected_qa: "Rejected by QA",
  wrong_item: "Wrong Item Supplied",
  expired: "Expired / Shelf-life",
  surplus: "Surplus / Not Required",
  warranty_replacement: "Warranty Replacement",
  other: "Other",
};

function roleLabel(key: string | null | undefined): string {
  if (!key) return "Any approver";
  return USER_TYPE_CATALOG.find((t) => t.key === key)?.label ?? key;
}

function GRStatusChip({ gr }: { gr: any }) {
  const approval = gr?.approval;
  const status = String(gr?.status ?? "draft").toLowerCase();
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
  if (status === "dispatched") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-blue-50 text-blue-700 border-blue-200">
        Dispatched
      </span>
    );
  }
  return <StatusChip status={gr?.status ?? "draft"} />;
}

function priorActionByMe(me: any, gr: any): any | null {
  if (!me || !gr?.approval?.history) return null;
  return (
    [...gr.approval.history]
      .reverse()
      .find((h: any) => h.actionById === me.userId) ?? null
  );
}

function canActOnCurrentStep(me: any, gr: any): boolean {
  if (!me || !gr?.approval) return false;
  if (gr.approval.status !== "pending_approval") return false;
  const step = gr.approval.workflow?.steps?.find(
    (s: any) => s.stepOrder === gr.approval.currentStepOrder,
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
    gr.projectId ?? null,
  );
}

function fmtQty(v: any, unit?: string | null) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ""}`;
}
function fmtInr(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
function fmtDate(v: any): string {
  if (!v) return "—";
  try {
    const d = new Date(v);
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
function fmtDateTime(v: any): string {
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(v);
  }
}

export default function GoodReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: gr, isLoading } = useGoodReturn(id);
  const { me } = usePermissions();

  // Submit dialog (separate from Approve/Reject which ApprovalActionBar handles).
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitPending, setSubmitPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Dispatch dialog — shown for approved returns.
  const [dispatchConfirmOpen, setDispatchConfirmOpen] = useState(false);
  const [dispatchPending, setDispatchPending] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const handleSubmit = () => {
    setSubmitError(null);
    setSubmitConfirmOpen(true);
  };

  const doSubmit = async () => {
    setSubmitError(null);
    setSubmitPending(true);
    try {
      const res = await fetch(`/api/store/good-returns/${id}/submit`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      qc.invalidateQueries({ queryKey: ["good-return", id] });
      qc.invalidateQueries({ queryKey: ["good-returns"] });
      setSubmitConfirmOpen(false);
    } catch (err: any) {
      setSubmitError(err?.message ?? "Failed to submit for approval");
    } finally {
      setSubmitPending(false);
    }
  };

  const doDispatch = async () => {
    setDispatchError(null);
    setDispatchPending(true);
    try {
      const res = await fetch(`/api/store/good-returns/${id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      qc.invalidateQueries({ queryKey: ["good-return", id] });
      qc.invalidateQueries({ queryKey: ["good-returns"] });
      setDispatchConfirmOpen(false);
    } catch (err: any) {
      setDispatchError(err?.message ?? "Failed to dispatch return");
    } finally {
      setDispatchPending(false);
    }
  };

  const lines: any[] = useMemo(
    () => (Array.isArray(gr?.lines) ? gr.lines : []),
    [gr],
  );

  const totals = useMemo(() => {
    let totalQty = 0;
    let totalAmount = 0;
    for (const l of lines) {
      const q = Number(l.returnQty ?? l.quantity ?? 0);
      const r = Number(l.unitRate ?? l.rate ?? 0);
      if (Number.isFinite(q)) totalQty += q;
      if (Number.isFinite(q * r)) totalAmount += q * r;
    }
    return { totalQty, totalAmount };
  }, [lines]);

  if (isLoading) return <PageSkeleton />;
  if (!gr) {
    return (
      <>
        <PageHeader
          title="Good Return"
          breadcrumbs={[
            { label: "Store", href: "/store" },
            { label: "Good Return", href: "/store/good-return" },
            { label: id },
          ]}
          onBack={() => router.push("/store/good-return")}
        />
        <PageContainer>
          <p className="text-gray-500 py-12 text-center">Good Return not found.</p>
        </PageContainer>
      </>
    );
  }

  const status = String(gr.status ?? "draft").toLowerCase();
  const isApproved = status === "approved";

  const approvalEntries =
    gr.approval?.history?.map((h: any) => ({
      stepOrder: h.stepOrder,
      action: h.action,
      actionByName: h.actionByName,
      actionAt: h.actionAt,
      comments: h.comments,
    })) ?? [];

  const myPriorAction = priorActionByMe(me, gr);

  return (
    <>
      <PageHeader
        title={gr.returnNumber ?? `Good Return ${id}`}
        subtitle={`Good Return — ${gr.projectName ?? "—"} → ${gr.vendorName ?? "—"}`}
        breadcrumbs={[
          { label: "Store", href: "/store" },
          { label: "Good Return", href: "/store/good-return" },
          { label: gr.returnNumber ?? id },
        ]}
        onBack={() => router.push("/store/good-return")}
        actions={
          <div className="flex items-center gap-2">
            <GRStatusChip gr={gr} />
            {status === "draft" && (
              <PrimaryButton
                onClick={handleSubmit}
                disabled={submitPending}
              >
                <Send className="w-4 h-4" /> Submit for Approval
              </PrimaryButton>
            )}
            {isApproved && (
              <PrimaryButton
                onClick={() => {
                  setDispatchError(null);
                  setDispatchConfirmOpen(true);
                }}
                disabled={dispatchPending}
              >
                <Truck className="w-4 h-4" /> Mark Dispatched
              </PrimaryButton>
            )}
            {(() => {
              const canAct = canActOnCurrentStep(me, gr);
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
                  entityType="goodReturn"
                  entityId={id}
                  currentStatus={gr.status}
                  requiredPermission="store.good_return.approve"
                  actionEndpoint={`/api/store/good-returns/${id}/approve`}
                  invalidateKeys={[
                    ["good-returns"],
                    ["good-return", id],
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
                <span className="w-9 h-9 rounded-md flex items-center justify-center bg-rose-50 text-rose-600 border border-rose-200">
                  <PackageX className="w-5 h-5" />
                </span>
                <div>
                  <div className="text-sm font-mono font-semibold text-gray-900">
                    {gr.returnNumber ?? "—"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    {REASON_LABEL[gr.reason] ?? gr.reason ?? "—"}
                  </div>
                </div>
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-5 text-sm">
                <Stat label="Project">{gr.projectName ?? "—"}</Stat>
                <Stat label="Location">{gr.locationName ?? "—"}</Stat>
                <Stat label="Vendor">{gr.vendorName ?? "—"}</Stat>
                <Stat label="Date">{fmtDate(gr.returnDate)}</Stat>

                <Stat label="Source GRN" mono>
                  {gr.grnNumber || "—"}
                </Stat>
                <Stat label="Challan No." mono>
                  {gr.challanNo || "—"}
                </Stat>
                <Stat label="Status">
                  <StatusChip status={gr.status ?? "draft"} />
                </Stat>

                {gr.vehicleNo && (
                  <Stat label="Vehicle No." mono>
                    {gr.vehicleNo}
                  </Stat>
                )}
                {gr.driverName && <Stat label="Driver">{gr.driverName}</Stat>}
                {gr.driverMobileNo && (
                  <Stat label="Driver Mobile" mono>
                    {gr.driverMobileNo}
                  </Stat>
                )}

                <Stat label="Items">
                  {lines.length || gr.lineCount || 0}
                </Stat>
                <Stat label="Total Qty">{fmtQty(totals.totalQty)}</Stat>
                {(gr.transactionAmount ?? totals.totalAmount) > 0 && (
                  <Stat label="Transaction Amount" strong>
                    {fmtInr(gr.transactionAmount ?? totals.totalAmount)}
                  </Stat>
                )}
              </dl>

              {gr.remarks && (
                <div className="mt-5 pt-5 border-t border-gray-100">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    Remarks
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {gr.remarks}
                  </p>
                </div>
              )}
            </div>

            {gr.ewayBillNo && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3 text-xs text-gray-700 flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  <AlertTriangle className="w-3 h-3" /> E-Way Bill
                </span>
                <span className="font-mono">{gr.ewayBillNo}</span>
                {gr.intercityTransfer && (
                  <span className="ml-auto text-[10px] text-gray-500">
                    Intercity — exempt threshold
                  </span>
                )}
              </div>
            )}

            {/* Return items table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  Return Items ({lines.length})
                </h2>
              </div>

              {lines.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    No items on this return.
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
                        <th className="px-4 py-3 text-right font-bold">Return Qty</th>
                        <th className="px-4 py-3 text-right font-bold">Unit Rate</th>
                        <th className="px-4 py-3 text-right font-bold">Amount</th>
                        <th className="px-4 py-3 text-left font-bold">Batch No.</th>
                        <th className="px-6 py-3 text-left font-bold">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.map((l: any, idx: number) => {
                        const q = Number(l.returnQty ?? l.quantity ?? 0);
                        const r = Number(l.unitRate ?? l.rate ?? 0);
                        const amt = Number.isFinite(q * r) ? q * r : 0;
                        return (
                          <tr
                            key={l.id ?? l.itemId ?? idx}
                            className="hover:bg-indigo-50/20 transition-colors"
                          >
                            <td className="px-4 py-3 text-xs font-mono text-gray-400 tabular-nums">
                              {String(idx + 1).padStart(2, "0")}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">
                                {l.itemName ?? "—"}
                              </div>
                              {l.itemCode && (
                                <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                                  {l.itemCode}
                                </div>
                              )}
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
                              {fmtQty(q)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                              {fmtInr(r)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                              {fmtInr(amt)}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-700">
                              {l.batchNo ?? "—"}
                            </td>
                            <td className="px-6 py-3 text-xs text-gray-500">
                              {l.remarks ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
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
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                            {fmtInr(totals.totalAmount)}
                          </td>
                          <td colSpan={2} />
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
            {gr.approval && approvalEntries.length > 0 && (
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

            {status === "rejected" && gr.rejectionReason && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-800">
                <div className="font-semibold mb-1">Rejection reason</div>
                <div>{gr.rejectionReason}</div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Audit</h3>
              </div>
              <dl className="space-y-3 text-xs">
                <AuditField label="Created" value={fmtDateTime(gr.createdAt)} />
                <AuditField
                  label="Created By"
                  value={gr.createdByName ?? gr.createdBy ?? "—"}
                />
                <AuditField label="Updated" value={fmtDateTime(gr.updatedAt)} />
                <AuditField
                  label="Updated By"
                  value={gr.updatedByName ?? gr.updatedBy ?? "—"}
                />
                {gr.approvedBy && (
                  <AuditField label="Approved By" value={gr.approvedBy} />
                )}
                {gr.dispatchedAt && (
                  <AuditField
                    label="Dispatched At"
                    value={fmtDateTime(gr.dispatchedAt)}
                  />
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
            Submit Good Return{" "}
            <span className="font-semibold text-gray-900">
              {gr.returnNumber ?? id}
            </span>{" "}
            for approval? It will be routed through the active Good Return
            workflow and you won&apos;t be able to edit it until an
            approver actions it.
            {submitError && (
              <span className="mt-3 block rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {submitError}
              </span>
            )}
          </>
        }
      />

      <ConfirmDialog
        open={dispatchConfirmOpen}
        onClose={() => {
          if (!dispatchPending) {
            setDispatchConfirmOpen(false);
            setDispatchError(null);
          }
        }}
        onConfirm={doDispatch}
        title="Mark as Dispatched"
        confirmLabel="Dispatch"
        tone="primary"
        loading={dispatchPending}
        message={
          <>
            Mark return{" "}
            <span className="font-semibold text-gray-900">
              {gr.returnNumber ?? id}
            </span>{" "}
            as dispatched? Use this once the material has physically left
            the store on its way back to the vendor.
            {dispatchError && (
              <span className="mt-3 block rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {dispatchError}
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
