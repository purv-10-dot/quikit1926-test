"use client";

/**
 * Purchase Indent — detail page.
 *
 * Mirrors the PR detail page: header info card, line items table with
 * fallback-aware field reads, approval timeline sidebar, audit card,
 * and an ApprovalActionBar for L1/L2/L3 approvers. The Submit for
 * Approval button is shown on drafts.
 */

import { toErrorMessage } from "@/lib/api/errors";
import { formatDateTimeIST } from "@/lib/format/datetime";
import { useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Send, FileText } from "lucide-react";
import {
  PageHeader, PageContainer, StatusChip,
  PrimaryButton, ApprovalTimeline, PageSkeleton,
} from "@/components/PageShell";
import { ApprovalActionBar } from "@/components/ApprovalActionBar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ProcurementCells } from "@/components/ProcurementCells";
import dynamic from "next/dynamic";
const SourceDocPeekModal = dynamic(
  () => import("@/components/SourceDocPeekModal").then((m) => m.SourceDocPeekModal),
  { ssr: false },
);
import { useIndent, useSubmitIndent } from "@/hooks/use-approvals";
import { usePermissions, type MeResponse } from "@/hooks/use-permissions";
import { USER_TYPE_CATALOG } from "@/lib/rbac/user-types";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";

import type {
  ApprovalStep,
  ApprovalHistoryEntry,
  ApprovalInfo,
} from "@/lib/approvals/approval-info";
import type { IndentLine, IndentDetail } from "@/lib/purchase/indent-detail";

/** Matches PageShell's ApprovalTimeline entry shape. */
interface TimelineEntry {
  step: number;
  action: string;
  actionBy: string;
  actionAt: string;
  comments?: string;
  title?: string;
}

/** Human-readable label for a userType key stored in workflow steps. */
function roleLabel(key: string | null | undefined): string {
  if (!key) return "Any approver";
  return USER_TYPE_CATALOG.find((t) => t.key === key)?.label ?? key;
}

/**
 * True when the viewer is allowed to act on the indent's current step.
 * Thin wrapper around the shared RBAC helper — keeps the UI aligned
 * with the server so hidden buttons == 403s.
 */
function canActOnCurrentStep(
  me: MeResponse | null | undefined,
  indent: IndentDetail | null | undefined,
): boolean {
  if (!me || !indent?.approval) return false;
  if (indent.approval.status !== "pending_approval") return false;
  const step = indent.approval.workflow?.steps?.find(
    (s: ApprovalStep) => s.stepOrder === indent.approval?.currentStepOrder,
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
    indent.projectId ?? null,
  );
}

function lineQty(line: IndentLine): number {
  const raw = line?.qtyRequested ?? line?.quantity ?? line?.qtyOpen ?? 0;
  return parseFloat(String(raw)) || 0;
}
function lineRate(line: IndentLine): number {
  const raw = line?.estimatedRate ?? line?.unitRate ?? 0;
  return parseFloat(String(raw)) || 0;
}
function lineAmount(line: IndentLine): number {
  const raw = line?.estimatedAmount ?? line?.amount;
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    return parseFloat(String(raw)) || 0;
  }
  return lineQty(line) * lineRate(line);
}

export default function IndentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: indent, isLoading } = useIndent(id);
  const submitMutation = useSubmitIndent();
  const { me } = usePermissions();
  const [peekOpen, setPeekOpen] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const lines: IndentLine[] = useMemo(() => indent?.lines ?? [], [indent]);
  const estimatedTotal = useMemo(() => {
    if (lines.length > 0) {
      return lines.reduce((sum: number, l: IndentLine) => sum + lineAmount(l), 0);
    }
    return parseFloat(String(indent?.estimatedTotal ?? "0")) || 0;
  }, [lines, indent?.estimatedTotal]);

  if (isLoading) return <PageSkeleton />;
  if (!indent) {
    return (
      <PageContainer>
        <p className="text-gray-500 py-12 text-center">Indent not found</p>
      </PageContainer>
    );
  }

  const handleSubmit = () => {
    setSubmitError(null);
    setSubmitConfirmOpen(true);
  };

  const doSubmit = async () => {
    try {
      await submitMutation.mutateAsync(id);
      setSubmitConfirmOpen(false);
    } catch (err: unknown) {
      // Keep the dialog open so the user can read the reason.
      setSubmitError(toErrorMessage(err, "Failed to submit indent"));
    }
  };

  const currentStep =
    indent.status === "draft" ? 0 :
    indent.status === "submitted" ? 1 :
    indent.status === "approved_l1" ? 2 :
    indent.status === "approved_l2" ? 3 :
    indent.status === "l3_approved" || indent.status === "approved" ? 3 : 0;

  return (
    <>
      <PageHeader
        title={indent.indentNumber ?? `Indent ${id}`}
        subtitle={`Purchase Indent — ${indent.projectName ?? "—"}`}
        breadcrumbs={[
          { label: "Purchase", href: "/purchase" },
          { label: "Indents", href: "/purchase/indents" },
          { label: indent.indentNumber ?? id },
        ]}
        onBack={() => router.push("/purchase/indents")}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip status={indent.status ?? ""} />
            {indent.status === "draft" && (
              <PrimaryButton onClick={handleSubmit} disabled={submitMutation.isPending}>
                <Send className="w-4 h-4" /> Submit for Approval
              </PrimaryButton>
            )}
            <ApprovalActionBar
              entityType="indent"
              entityId={id}
              currentStatus={indent.status ?? undefined}
              requiredPermission="purchase.indent.approve_l1"
              actionEndpoint={`/api/purchase/indents/${id}/approve`}
              invalidateKeys={[["indents"], ["indent", id]]}
              actionableStatuses={[
                "pending_approval",
                "submitted",
                "submitted_l1",
                "approved_l1",
                "approved_l2",
              ]}
              // Workflow-aware gating — only the current step's actor
              // sees live buttons. Setting `hidden` explicitly also
              // opts out of the legacy permission check, so HO User
              // (whose backing role lacks `purchase.indent.approve_l1`)
              // can still approve when it's their turn.
              hidden={!canActOnCurrentStep(me, indent)}
            />
          </div>
        }
      />

      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Header Info */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoField label="Indent Number" value={indent.indentNumber} />
                <InfoField
                  label="Source PR"
                  value={
                    indent.sourceMrNumber ? (
                      <span className="text-xs text-accent-600">
                        {indent.sourceMrNumber}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Direct</span>
                    )
                  }
                />
                <InfoField label="Project" value={indent.projectName} />
                <InfoField label="Indent Date" value={indent.indentDate} />
                <InfoField label="Required By" value={indent.requiredDate ?? indent.requestedByDate ?? "—"} />
                <InfoField label="Urgent" value={indent.isUrgent ? "Yes" : "No"} />
                <InfoField label="Status" value={<StatusChip status={indent.status ?? ""} />} />
                <InfoField
                  label="Estimated Total"
                  value={`₹ ${estimatedTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
                  highlight
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">
                  Line Items ({lines.length || indent.lineCount || 0})
                </h3>
              </div>
              {lines.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">
                  No line items
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase w-8">#</th>
                        <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Material</th>
                        <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-20">Qty</th>
                        <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase w-16">UOM</th>
                        <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-28">Rate (₹)</th>
                        <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-32">Amount (₹)</th>
                        <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Preferred Vendor</th>
                        <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase w-32">PO</th>
                        <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase w-32">GRN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {lines.map((line: IndentLine, i: number) => {
                        const qty = lineQty(line);
                        const rate = lineRate(line);
                        const amt = lineAmount(line);
                        return (
                          <tr key={line.lineId ?? line.id ?? i}>
                            <td className="px-4 py-3 text-xs text-gray-400">{i + 1}</td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                              {line.itemName ?? line.itemId ?? "—"}
                              {line.itemCode && (
                                <span className="ml-2 text-[10px] text-gray-400">
                                  {line.itemCode}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-700 tabular-nums">
                              {qty > 0 ? qty.toLocaleString("en-IN") : "—"}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 uppercase">
                              {line.uomCode ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-700 tabular-nums">
                              {rate > 0 ? `₹ ${rate.toLocaleString("en-IN")}` : "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 tabular-nums">
                              {amt > 0
                                ? `₹ ${amt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              {line.preferredVendorName ?? "—"}
                            </td>
                            <ProcurementCells procurement={line.procurement} />
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50/50">
                        <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">
                          Total:
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right tabular-nums">
                          ₹ {estimatedTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Source PR peek card */}
            {indent.sourceMrId && (
              <button
                type="button"
                onClick={() =>
                  router.push(`/purchase/requisitions/${indent.sourceMrId}`)
                }
                className="w-full text-left bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-accent-300 hover:bg-accent-50 transition-colors"
              >
                <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Purchase Requisition Details
                </h3>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent-50 text-accent-600 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {indent.sourceMrNumber ?? indent.sourceMrId}
                    </div>
                    {indent.indentDate && (
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Indent raised: {indent.indentDate}
                      </div>
                    )}
                    <div className="text-[11px] text-accent-600 underline mt-1">
                      View full details →
                    </div>
                  </div>
                </div>
              </button>
            )}

            {/* Approval Timeline */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Approval Timeline</h3>
              {indent.status === "draft" ? (
                <p className="text-sm text-gray-500">Not yet submitted for approval.</p>
              ) : !indent.approval ? (
                <p className="text-sm text-gray-500">
                  Submitted, but no approval instance is linked to this indent.
                </p>
              ) : (
                (() => {
                  // First row: requester. Then one row per configured
                  // workflow step, stamping completed rows from history
                  // and marking the live step as "Next". Mirrors the PR
                  // detail timeline exactly.
                  const approval = indent.approval!;
                  const entries: TimelineEntry[] = [
                    {
                      step: 0,
                      action: "request",
                      title: "Requested",
                      actionBy: approval.requestedByName || "Requester",
                      actionAt: formatDateTimeIST(approval.requestedAt),
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
                        action: acted.action, // approve | reject | return
                        actionBy: acted.actionByName || approverLabel,
                        actionAt: formatDateTimeIST(acted.actionAt),
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
                      actionAt: isCurrent ? "Awaiting action" : "Not yet reached",
                    });
                  });
                  return <ApprovalTimeline entries={entries} />;
                })()
              )}
            </div>

            {/* Audit */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Audit</h3>
              <div className="space-y-2">
                <InfoField
                  label="Created"
                  value={formatDateTimeIST(indent.createdAt)}
                />
                <InfoField
                  label="Created By"
                  value={indent.createdByName ?? indent.createdBy ?? "—"}
                />
                <InfoField
                  label="Requested By"
                  value={indent.requestedByName ?? indent.requestedBy ?? "—"}
                />
              </div>
            </div>
          </div>
        </div>
      </PageContainer>

      <SourceDocPeekModal
        open={peekOpen}
        initial={
          indent.sourceMrId ? { type: "pr", id: indent.sourceMrId } : null
        }
        onClose={() => setPeekOpen(false)}
      />

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
            Submit indent{" "}
            <span className="font-semibold text-gray-900">
              {indent.indentNumber ?? id}
            </span>{" "}
            for approval? It will be routed through the active Purchase
            Indents workflow and you won't be able to edit it until an
            approver returns it.
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
  highlight,
}: {
  label: string;
  value: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
        {label}
      </p>
      <div className={`text-sm mt-0.5 ${highlight ? "font-bold text-gray-900" : "text-gray-700"}`}>
        {value ?? "—"}
      </div>
    </div>
  );
}
