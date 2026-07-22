"use client";

/**
 * Stock Transfer — detail page.
 *
 * Same layout as the Material Issue / Gate Pass / Good Return detail
 * pages: overview grid on the left, Approval Timeline + Audit on the
 * right. Submit / Approve / Reject / Dispatch / Receive live in the
 * header so this is the canonical action surface (the list-view
 * icons just deep-link back here).
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
  PackageCheck,
  ArrowRight,
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
import { useStockTransfer } from "@/hooks/use-store";
import { useAssets } from "@/hooks/use-masters";
import { usePermissions, type MeResponse } from "@/hooks/use-permissions";
import { USER_TYPE_CATALOG } from "@/lib/rbac/user-types";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";

import type {
  ApprovalStep,
  ApprovalHistoryEntry,
  ApprovalInfo,
} from "@/lib/approvals/approval-info";
import type {
  TransferLine,
  AssetLine,
  StockTransferDetail,
} from "@/lib/store/stock-transfer-detail";

interface ItemMaster {
  id: string;
  name?: string;
  code?: string;
  uomCode?: string;
}

interface AssetMaster {
  id: string;
  name?: string;
  assetCode?: string;
  category?: string;
}

const TRANSFER_TYPE_LABEL: Record<string, string> = {
  intra_site: "Intra-Site (Same Project)",
  inter_project: "Inter-Project",
  inter_site: "Inter-Site",
  warehouse_to_site: "Warehouse → Site",
};

const REASON_LABEL: Record<string, string> = {
  project_requirement: "Project Requirement",
  surplus_redistribution: "Surplus Redistribution",
  stock_consolidation: "Stock Consolidation",
  shortage_at_destination: "Shortage at Destination",
  equipment_relocation: "Equipment Relocation",
  return_to_warehouse: "Return to Warehouse",
  other: "Other",
};

function roleLabel(key: string | null | undefined): string {
  if (!key) return "Any approver";
  return USER_TYPE_CATALOG.find((t) => t.key === key)?.label ?? key;
}

function STStatusChip({ st }: { st: StockTransferDetail }) {
  const approval = st?.approval;
  const status = String(st?.status ?? "draft").toLowerCase();
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
  if (status === "dispatched" || status === "in_transit") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-orange-50 text-orange-700 border-orange-200">
        {status === "in_transit" ? "In Transit" : "Dispatched"}
      </span>
    );
  }
  if (status === "received") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
        Received
      </span>
    );
  }
  return <StatusChip status={st?.status ?? "draft"} />;
}

/**
 * True when the current user is the workflow's final approver — i.e.
 * the actor on the most recent `approve` history row. Used to gate
 * "Mark Dispatched" so only the person who closed the approval chain
 * sees the post-approval action.
 *
 * Falls back to the denormalised `st.approvedBy` field when the
 * history is empty (every step auto-skipped because the raiser was
 * also the approver).
 */
function wasFinalApprover(
  me: MeResponse | null | undefined,
  st: StockTransferDetail | null | undefined,
): boolean {
  if (!me?.userId || !st) return false;
  if (st.approval?.status !== "approved") return false;
  const history = Array.isArray(st.approval?.history) ? st.approval.history : [];
  const lastApprove = [...history]
    .reverse()
    .find((h) => h.action === "approve");
  if (lastApprove?.actionById) return lastApprove.actionById === me.userId;
  if (st.approvedBy) return st.approvedBy === me.userId;
  return false;
}

function priorActionByMe(
  me: MeResponse | null | undefined,
  st: StockTransferDetail | null | undefined,
): ApprovalHistoryEntry | null {
  if (!me || !st?.approval?.history) return null;
  return (
    [...st.approval.history]
      .reverse()
      .find((h) => h.actionById === me.userId) ?? null
  );
}

function canActOnCurrentStep(
  me: MeResponse | null | undefined,
  st: StockTransferDetail | null | undefined,
): boolean {
  if (!me || !st?.approval) return false;
  if (st.approval.status !== "pending_approval") return false;
  const step = st.approval.workflow?.steps?.find(
    (s: ApprovalStep) => s.stepOrder === st.approval?.currentStepOrder,
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
    st.sourceProjectId ?? null,
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

export default function StockTransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: st, isLoading } = useStockTransfer(id);
  const { data: assetsData } = useAssets();
  const { me } = usePermissions();

  const assetById = useMemo(() => {
    const m = new Map<string, AssetMaster>();
    for (const a of (assetsData?.data ?? []) as AssetMaster[]) m.set(a.id, a);
    return m;
  }, [assetsData]);

  // Submit — separate copy from Approve/Reject which ApprovalActionBar handles.
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitPending, setSubmitPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [dispatchConfirmOpen, setDispatchConfirmOpen] = useState(false);
  const [dispatchPending, setDispatchPending] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const [receiveConfirmOpen, setReceiveConfirmOpen] = useState(false);
  const [receivePending, setReceivePending] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  const handleSubmit = () => {
    setSubmitError(null);
    setSubmitConfirmOpen(true);
  };

  const doSubmit = async () => {
    setSubmitError(null);
    setSubmitPending(true);
    try {
      const res = await fetch(`/api/store/transfers/${id}/submit`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      qc.invalidateQueries({ queryKey: ["stock-transfer", id] });
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      setSubmitConfirmOpen(false);
    } catch (err: unknown) {
      setSubmitError(toErrorMessage(err, "Failed to submit for approval"));
    } finally {
      setSubmitPending(false);
    }
  };

  const doDispatch = async () => {
    setDispatchError(null);
    setDispatchPending(true);
    try {
      const res = await fetch(`/api/store/transfers/${id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      qc.invalidateQueries({ queryKey: ["stock-transfer", id] });
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      setDispatchConfirmOpen(false);
    } catch (err: unknown) {
      setDispatchError(toErrorMessage(err, "Failed to dispatch transfer"));
    } finally {
      setDispatchPending(false);
    }
  };

  const doReceive = async () => {
    setReceiveError(null);
    setReceivePending(true);
    try {
      const res = await fetch(`/api/store/transfers/${id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      qc.invalidateQueries({ queryKey: ["stock-transfer", id] });
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["stock-register"] });
      setReceiveConfirmOpen(false);
    } catch (err: unknown) {
      setReceiveError(toErrorMessage(err, "Failed to receive transfer"));
    } finally {
      setReceivePending(false);
    }
  };

  const lines: TransferLine[] = useMemo(
    () => (Array.isArray(st?.lines) ? st.lines : []),
    [st],
  );

  const assetLines: AssetLine[] = useMemo(
    () => (Array.isArray(st?.assetLines) ? st.assetLines : []),
    [st],
  );

  const totals = useMemo(() => {
    let totalQty = 0;
    for (const l of lines) {
      const q = Number(l.dispatchQty ?? l.quantity ?? 0);
      if (Number.isFinite(q)) totalQty += q;
    }
    return { totalQty };
  }, [lines]);

  if (isLoading) return <PageSkeleton />;
  if (!st) {
    return (
      <>
        <PageHeader
          title="Stock Transfer"
          breadcrumbs={[
            { label: "Store", href: "/store" },
            { label: "Stock Transfer", href: "/store/transfer" },
            { label: id },
          ]}
          onBack={() => router.push("/store/transfer")}
        />
        <PageContainer>
          <p className="text-gray-500 py-12 text-center">
            Stock Transfer not found.
          </p>
        </PageContainer>
      </>
    );
  }

  const status = String(st.status ?? "draft").toLowerCase();
  const isApproved = status === "approved";
  const canReceive = ["dispatched", "in_transit"].includes(status);

  const approvalEntries =
    st.approval?.history?.map((h: ApprovalHistoryEntry) => ({
      step: h.stepOrder,
      action: h.action,
      actionBy: h.actionByName ?? "User",
      actionAt: h.actionAt ? fmtDateTime(h.actionAt) : "",
      comments: h.comments ?? undefined,
    })) ?? [];

  const myPriorAction = priorActionByMe(me, st);

  return (
    <>
      <PageHeader
        title={st.transferNumber ?? `Stock Transfer ${id}`}
        subtitle={`Stock Transfer — ${st.fromLocationName ?? "—"} → ${st.toLocationName ?? "—"}`}
        breadcrumbs={[
          { label: "Store", href: "/store" },
          { label: "Stock Transfer", href: "/store/transfer" },
          { label: st.transferNumber ?? id },
        ]}
        onBack={() => router.push("/store/transfer")}
        actions={
          <div className="flex items-center gap-2">
            <STStatusChip st={st} />
            {status === "draft" && (
              <PrimaryButton
                onClick={handleSubmit}
                disabled={submitPending}
              >
                <Send className="w-4 h-4" /> Submit for Approval
              </PrimaryButton>
            )}
            {isApproved && wasFinalApprover(me, st) && (
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
            {canReceive && (
              <PrimaryButton
                onClick={() => {
                  setReceiveError(null);
                  setReceiveConfirmOpen(true);
                }}
                disabled={receivePending}
              >
                <PackageCheck className="w-4 h-4" /> Mark Received
              </PrimaryButton>
            )}
            {(() => {
              const canAct = canActOnCurrentStep(me, st);
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
                  entityType="stockTransfer"
                  entityId={id}
                  currentStatus={st.status ?? undefined}
                  requiredPermission="store.transfer.approve"
                  actionEndpoint={`/api/store/transfers/${id}/approve`}
                  invalidateKeys={[
                    ["stock-transfers"],
                    ["stock-transfer", id],
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
                <span className="w-9 h-9 rounded-md flex items-center justify-center bg-accent-50 text-accent-600 border border-accent-200">
                  <Truck className="w-5 h-5" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {st.transferNumber ?? "—"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    {TRANSFER_TYPE_LABEL[st.transferType ?? ""] ??
                      st.transferType ??
                      "—"}
                    {st.transferReason && (
                      <>
                        <span className="mx-1.5 text-gray-300">·</span>
                        {REASON_LABEL[st.transferReason] ?? st.transferReason}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* From → To banner */}
              <div className="mb-5 flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    From
                  </div>
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {st.fromLocationName ?? "—"}
                  </div>
                  {(st.fromCity || st.fromState) && (
                    <div className="text-[11px] text-gray-500">
                      {[st.fromCity, st.fromState].filter(Boolean).join(", ")}
                    </div>
                  )}
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    To
                  </div>
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {st.toLocationName ?? "—"}
                  </div>
                  {(st.toCity || st.toState) && (
                    <div className="text-[11px] text-gray-500">
                      {[st.toCity, st.toState].filter(Boolean).join(", ")}
                    </div>
                  )}
                </div>
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-5 text-sm">
                <Stat label="Source Project">
                  {st.sourceProjectName ?? "—"}
                </Stat>
                {st.destinationProjectName && (
                  <Stat label="Destination Project">
                    {st.destinationProjectName}
                  </Stat>
                )}
                <Stat label="Date">{fmtDate(st.transferDate)}</Stat>
                <Stat label="Status">
                  <StatusChip status={st.status ?? "draft"} />
                </Stat>

                {st.vehicleNo && (
                  <Stat label="Vehicle No." mono>
                    {st.vehicleNo}
                  </Stat>
                )}
                {st.dispatchDateTime && (
                  <Stat label="Dispatch Date & Time">
                    {fmtDateTime(st.dispatchDateTime)}
                  </Stat>
                )}
                {st.estTransitDays && (
                  <Stat label="Est. Transit Days">
                    {String(st.estTransitDays)}
                  </Stat>
                )}
                <Stat label="Items">
                  {lines.length || st.lineCount || 0}
                </Stat>
                <Stat label="Total Qty">{fmtQty(totals.totalQty)}</Stat>
                {(st.transactionAmount ?? 0) > 0 && (
                  <Stat label="Transaction Amount" strong>
                    {fmtInr(st.transactionAmount)}
                  </Stat>
                )}
                {st.interstateTransfer && (
                  <Stat label="Interstate">Yes</Stat>
                )}
                {st.chargeableTransfer && (
                  <Stat label="Chargeable">Yes</Stat>
                )}
              </dl>

              {st.remarks && (
                <div className="mt-5 pt-5 border-t border-gray-100">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    Remarks
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {st.remarks}
                  </p>
                </div>
              )}
            </div>

            {st.ewayBillNo && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3 text-xs text-gray-700 flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  <AlertTriangle className="w-3 h-3" /> E-Way Bill
                </span>
                <span className="">{st.ewayBillNo}</span>
                {st.interstateTransfer && (
                  <span className="ml-auto text-[10px] text-gray-500">
                    Interstate transfer
                  </span>
                )}
              </div>
            )}

            {/* Transfer items table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  Materials to Transfer ({lines.length})
                </h2>
              </div>

              {lines.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    No material lines on this transfer.
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
                        <th className="px-4 py-3 text-right font-bold">
                          Available
                        </th>
                        <th className="px-4 py-3 text-right font-bold">
                          Dispatch Qty
                        </th>
                        <th className="px-4 py-3 text-left font-bold">
                          Disp. Condition
                        </th>
                        <th className="px-6 py-3 text-left font-bold">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.map((l: TransferLine, idx: number) => {
                        // Line fields are denormalized at save-time; no item
                        // master load needed (older pre-denormalization
                        // records fall back to the id / blank).
                        const itemName = l.itemName ?? "—";
                        const itemCode = l.itemCode ?? "";
                        const uomCode = l.uomCode ?? "";
                        return (
                        <tr
                          key={l.id ?? l.itemId ?? idx}
                          className="hover:bg-indigo-50/20 transition-colors"
                        >
                          <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">
                            {String(idx + 1).padStart(2, "0")}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">
                              {itemName}
                            </div>
                            {itemCode && (
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                {itemCode}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {uomCode ? (
                              <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded">
                                {uomCode}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                            {fmtQty(l.availableStock)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                            {fmtQty(l.dispatchQty ?? l.quantity)}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-700">
                            {l.dispatchCondition
                              ? l.dispatchCondition.replace(/_/g, " ")
                              : "—"}
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
                          <td colSpan={4} className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                            Total
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">
                            {fmtQty(totals.totalQty)}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>

            {/* Assets to transfer */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  Assets to Transfer ({assetLines.length})
                </h2>
              </div>

              {assetLines.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    No asset lines on this transfer.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 tracking-wider border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-bold w-10">#</th>
                        <th className="px-4 py-3 text-left font-bold">Asset</th>
                        <th className="px-4 py-3 text-left font-bold">Category</th>
                        <th className="px-4 py-3 text-left font-bold">UOM</th>
                        <th className="px-4 py-3 text-left font-bold">
                          Condition
                        </th>
                        <th className="px-6 py-3 text-left font-bold">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {assetLines.map((l: AssetLine, idx: number) => {
                        const masterAsset = l.assetId ? assetById.get(l.assetId) : null;
                        const assetName = l.assetName ?? masterAsset?.name ?? "—";
                        const assetCode = l.assetCode ?? masterAsset?.assetCode ?? "";
                        const category = l.category ?? masterAsset?.category ?? "—";
                        const uomCode = l.uomCode ?? "—";
                        return (
                          <tr
                            key={l.id ?? l.assetId ?? idx}
                            className="hover:bg-indigo-50/20 transition-colors"
                          >
                            <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">
                              {String(idx + 1).padStart(2, "0")}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">
                                {assetName}
                              </div>
                              {assetCode && (
                                <div className="text-[10px] text-gray-400 mt-0.5">
                                  {assetCode}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {category ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {uomCode ? (
                                <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded">
                                  {uomCode}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-700">
                              {l.dispatchCondition
                                ? String(l.dispatchCondition).replace(/_/g, " ")
                                : "—"}
                            </td>
                            <td className="px-6 py-3 text-xs text-gray-500">
                              {l.remarks ?? "—"}
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

          {/* Sidebar — Approval Timeline + Audit */}
          <div className="space-y-5">
            {st.approval && approvalEntries.length > 0 && (
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

            {status === "rejected" && st.rejectionReason && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-800">
                <div className="font-semibold mb-1">Rejection reason</div>
                <div>{st.rejectionReason}</div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Audit</h3>
              </div>
              <dl className="space-y-3 text-xs">
                <AuditField label="Created" value={fmtDateTime(st.createdAt)} />
                <AuditField
                  label="Created By"
                  value={st.createdByName ?? st.createdBy ?? "—"}
                />
                <AuditField label="Updated" value={fmtDateTime(st.updatedAt)} />
                <AuditField
                  label="Updated By"
                  value={st.updatedByName ?? st.updatedBy ?? "—"}
                />
                {(st.approvedByName ?? st.approvedBy) && (
                  <AuditField
                    label="Approved By"
                    value={st.approvedByName ?? st.approvedBy}
                  />
                )}
                {st.dispatchedAt && (
                  <AuditField
                    label="Dispatched At"
                    value={fmtDateTime(st.dispatchedAt)}
                  />
                )}
                {st.receivedAt && (
                  <AuditField
                    label="Received At"
                    value={fmtDateTime(st.receivedAt)}
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
            Submit Stock Transfer{" "}
            <span className="font-semibold text-gray-900">
              {st.transferNumber ?? id}
            </span>{" "}
            for approval? It will be routed through the active Stock
            Transfer workflow and you won&apos;t be able to edit it
            until an approver actions it.
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
            Mark transfer{" "}
            <span className="font-semibold text-gray-900">
              {st.transferNumber ?? id}
            </span>{" "}
            as dispatched? Use this once the truck has left the source
            location.
            {dispatchError && (
              <span className="mt-3 block rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {dispatchError}
              </span>
            )}
          </>
        }
      />

      <ConfirmDialog
        open={receiveConfirmOpen}
        onClose={() => {
          if (!receivePending) {
            setReceiveConfirmOpen(false);
            setReceiveError(null);
          }
        }}
        onConfirm={doReceive}
        title="Mark as Received"
        confirmLabel="Receive"
        tone="primary"
        loading={receivePending}
        message={
          <>
            Mark transfer{" "}
            <span className="font-semibold text-gray-900">
              {st.transferNumber ?? id}
            </span>{" "}
            as received? The material lands on the destination store&apos;s
            stock ledger once confirmed.
            {receiveError && (
              <span className="mt-3 block rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {receiveError}
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
        className={`mt-1 text-sm text-gray-900 truncate ${mono ? "text-xs" : ""} ${
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
