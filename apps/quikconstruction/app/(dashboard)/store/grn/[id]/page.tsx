"use client";

/**
 * GRN detail page. Mirrors the Indent / RFQ / PO detail layout:
 *   - Left (main): header info card + line items table
 *   - Right (sidebar): Source PO card, Approval Timeline, Audit
 */

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Download, Send, FileText, Paperclip } from "lucide-react";
import {
  PageHeader, PageContainer, StatusChip, PageSkeleton,
  PrimaryButton, SecondaryButton, ApprovalTimeline,
} from "@/components/PageShell";
import { useGRN, useSubmitGRN } from "@/hooks/use-purchase";
import { ApprovalActionBar } from "@/components/ApprovalActionBar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { USER_TYPE_CATALOG } from "@/lib/rbac/user-types";

function roleLabel(key: string | null | undefined): string {
  if (!key) return "Any approver";
  return USER_TYPE_CATALOG.find((t) => t.key === key)?.label ?? key;
}

export default function GRNDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: grn, isLoading } = useGRN(id);
  const submitMutation = useSubmitGRN();
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = () => {
    setSubmitError(null);
    setSubmitConfirmOpen(true);
  };

  const doSubmit = async () => {
    try {
      await submitMutation.mutateAsync(id);
      setSubmitConfirmOpen(false);
    } catch (err: any) {
      setSubmitError(err?.message ?? "Failed to submit GRN");
    }
  };

  if (isLoading) return <PageSkeleton />;
  if (!grn)
    return (
      <PageContainer>
        <p className="text-gray-500 py-12 text-center">GRN not found</p>
      </PageContainer>
    );

  const vendorName = grn.vendorName ?? grn.vendor?.name ?? "—";
  const projectName = grn.projectName ?? grn.project?.name ?? "—";
  const poNumber = grn.poNumber ?? grn.po?.poNumber ?? "—";
  const poId = grn.poId ?? grn.po?.id ?? null;
  const lines = grn.lines ?? [];

  return (
    <>
      <PageHeader
        title={grn.grnNumber ?? `GRN ${id}`}
        subtitle={`GRN — ${vendorName}`}
        breadcrumbs={[
          { label: "Store", href: "/store" },
          { label: "GRN", href: "/store/grn" },
          { label: grn.grnNumber ?? id },
        ]}
        onBack={() => router.push("/store/grn")}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip status={grn.status} />
            <SecondaryButton onClick={() => window.print()}>
              <Download className="w-4 h-4" /> Print
            </SecondaryButton>
            {grn.status === "draft" && (
              <PrimaryButton
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
              >
                <Send className="w-4 h-4" /> Submit for Approval
              </PrimaryButton>
            )}
            <ApprovalActionBar
              entityType="grn"
              entityId={id}
              currentStatus={grn.status}
              requiredPermission="purchase.grn.approve"
              actionEndpoint={`/api/purchase/grn/${id}/approve`}
              invalidateKeys={[["grns"], ["grn", id]]}
              actionableStatuses={["submitted", "pending_approval"]}
            />
          </div>
        }
      />

      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header Info */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoField label="GRN Number" value={grn.grnNumber} bold />
                <InfoField label="PO Number" value={poNumber} />
                <InfoField label="GRN Date" value={grn.grnDate ?? "—"} />
                <InfoField label="Project" value={projectName} />
                <InfoField label="Vendor" value={vendorName} />
                <InfoField
                  label="Status"
                  value={<StatusChip status={grn.status} />}
                />
                <InfoField
                  label="Supplier Invoice"
                  value={
                    grn.supplierInvoiceNo
                      ? grn.supplierInvoiceDate
                        ? `${grn.supplierInvoiceNo} · ${grn.supplierInvoiceDate}`
                        : grn.supplierInvoiceNo
                      : "—"
                  }
                />
                <InfoField label="Challan No" value={grn.challanNo ?? "—"} />
                <InfoField
                  label="Challan Date"
                  value={grn.challanDate ?? "—"}
                />
                <InfoField label="Vehicle No" value={grn.vehicleNo ?? "—"} />
                <InfoField
                  label="Received By"
                  value={grn.receivedByName ?? "—"}
                />
                <InfoField label="E-Way Bill" value={grn.ewayBillNo ?? "—"} />
                <InfoField
                  label="Invoice Value"
                  value={
                    grn.approxInvoiceValue
                      ? `₹ ${Number(grn.approxInvoiceValue).toLocaleString("en-IN")}`
                      : "—"
                  }
                />
                <InfoField
                  label="Overall Quality"
                  value={
                    grn.overallQualityStatus ? (
                      <StatusChip status={grn.overallQualityStatus} />
                    ) : (
                      "—"
                    )
                  }
                />
                <InfoField
                  label="Weighbridge Slip"
                  value={grn.weighbridgeSlipNo ?? "—"}
                />
                <InfoField
                  label="Challan Attachment"
                  value={
                    grn.challanAttachment ? (
                      <a
                        href={grn.challanAttachment}
                        target="_blank"
                        rel="noreferrer"
                        title={grn.challanAttachment}
                        className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 hover:underline font-medium text-xs max-w-full"
                      >
                        <Paperclip className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {grn.challanAttachment.split("/").pop()}
                        </span>
                      </a>
                    ) : (
                      <span className="text-xs text-amber-600">
                        No attachment
                      </span>
                    )
                  }
                />
              </div>
              {grn.remarks && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                    Remarks
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-line">
                    {grn.remarks}
                  </p>
                </div>
              )}
            </div>

            {/* Line Items */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">
                  GRN Line Items ({lines.length || grn.lineCount || 0})
                </h3>
              </div>
              {lines.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">
                  {grn.lineCount
                    ? `${grn.lineCount} items received`
                    : "No line items"}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase w-8">
                          #
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">
                          Material
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase w-16">
                          UOM
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-20">
                          Received
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-20">
                          Accepted
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-20">
                          Rejected
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase w-24">
                          Quality
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">
                          Batch
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {lines.map((line: any, i: number) => (
                        <tr key={line.id ?? i}>
                          <td className="px-3 py-2.5 text-xs text-gray-400">
                            {i + 1}
                          </td>
                          <td className="px-3 py-2.5 text-sm font-medium text-gray-900">
                            {line.itemName ?? line.itemId}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-600 uppercase">
                            {line.uomCode ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-sm text-right tabular-nums">
                            {line.receivedQty}
                          </td>
                          <td className="px-3 py-2.5 text-sm text-right text-green-600 font-medium tabular-nums">
                            {line.acceptedQty}
                          </td>
                          <td className="px-3 py-2.5 text-sm text-right text-red-600 tabular-nums">
                            {line.rejectedQty && line.rejectedQty !== "0"
                              ? line.rejectedQty
                              : "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            {line.qualityStatus ? (
                              <StatusChip status={line.qualityStatus} />
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">
                            {line.batchNo ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Source PO card */}
            {poId && poNumber !== "—" && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Purchase Order Details
                </h3>
                <button
                  type="button"
                  onClick={() => router.push(`/purchase/orders/${poId}`)}
                  className="w-full text-left flex items-start gap-3 hover:bg-indigo-50/30 rounded-lg p-1 -m-1"
                >
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 font-mono truncate">
                      {poNumber}
                    </p>
                    {grn.grnDate && (
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        GRN raised: {grn.grnDate}
                      </p>
                    )}
                    <p className="text-[11px] text-indigo-600 underline mt-1">
                      View full details →
                    </p>
                  </div>
                </button>
              </div>
            )}

            {/* Approval Timeline */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Approval Timeline
              </h3>
              {grn.status === "draft" ? (
                <p className="text-sm text-gray-500">
                  Not yet submitted for approval.
                </p>
              ) : !grn.approval ? (
                <p className="text-sm text-gray-500">
                  Submitted, but no approval instance is linked to this GRN.
                </p>
              ) : (
                (() => {
                  const entries: any[] = [
                    {
                      step: 0,
                      action: "request",
                      title: "Requested",
                      actionBy: grn.approval.requestedByName || "Requester",
                      actionAt: new Date(
                        grn.approval.requestedAt,
                      ).toLocaleString(),
                    },
                  ];
                  grn.approval.workflow.steps.forEach((s: any) => {
                    const acted = [...grn.approval.history]
                      .reverse()
                      .find((h: any) => h.stepOrder === s.stepOrder);
                    const approverLabel = s.approverUserName
                      ? `${s.approverUserName} (${roleLabel(s.approverRoleId)})`
                      : roleLabel(s.approverRoleId);
                    if (acted) {
                      entries.push({
                        step: s.stepOrder,
                        action: acted.action,
                        actionBy: acted.actionByName || approverLabel,
                        actionAt: new Date(acted.actionAt).toLocaleString(),
                        comments: acted.comments || undefined,
                      });
                      return;
                    }
                    const isCurrent =
                      grn.approval.status === "pending_approval" &&
                      grn.approval.currentStepOrder === s.stepOrder;
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

            {/* Audit */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Audit
              </h3>
              <div className="space-y-2 text-xs text-gray-500">
                {grn.createdAt && (
                  <p>Created: {new Date(grn.createdAt).toLocaleString()}</p>
                )}
                <p>By: {grn.createdByName ?? grn.createdBy ?? "—"}</p>
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
            Submit GRN{" "}
            <span className="font-semibold text-gray-900">
              {grn.grnNumber ?? id}
            </span>{" "}
            for approval? It will be routed through the active GRN
            workflow and stock postings happen on final approval.
            {submitError && (
              <span className="mt-3 block rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
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
  bold,
}: {
  label: string;
  value: any;
  bold?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
        {label}
      </p>
      <div
        className={`text-sm mt-0.5 ${
          bold ? "font-bold text-gray-900" : "text-gray-700"
        }`}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}
