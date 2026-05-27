"use client";

/**
 * RFQ — detail page. Mirrors the PR / Indent pattern:
 *   - Header info card + line items table
 *   - Submit-for-approval button (draft → pending_approval)
 *   - ApprovalActionBar (pending_approval → approved)
 *   - Source Indent card in the sidebar; click → SourceDocPeekModal
 *     which itself chains up through the Indent to its source PR.
 */

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Send, FileText, Mail, Building2, Eye } from "lucide-react";
import {
  PageHeader, PageContainer, StatusChip,
  PrimaryButton, PageSkeleton, ApprovalTimeline,
} from "@/components/PageShell";
import { ApprovalActionBar } from "@/components/ApprovalActionBar";
import { usePermissions } from "@/hooks/use-permissions";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";
import { USER_TYPE_CATALOG } from "@/lib/rbac/user-types";
import dynamic from "next/dynamic";
import type { SourceDocType } from "@/components/SourceDocPeekModal";
const RfqSubmitPreviewModal = dynamic(
  () => import("@/components/RfqSubmitPreviewModal").then((m) => m.RfqSubmitPreviewModal),
  { ssr: false },
);
const SourceDocPeekModal = dynamic(
  () => import("@/components/SourceDocPeekModal").then((m) => m.SourceDocPeekModal),
  { ssr: false },
);
import { useRFQ, useSubmitRFQ, useIndent } from "@/hooks/use-approvals";

function lineQty(line: any): number {
  const raw = line?.quantity ?? line?.qtyRequested ?? 0;
  return parseFloat(String(raw)) || 0;
}

/** Resolve an approver role key (e.g. SITE_ADMIN) to its display label. */
function roleLabel(key: string | null | undefined): string {
  if (!key) return "Any approver";
  return USER_TYPE_CATALOG.find((t) => t.key === key)?.label ?? key;
}

/**
 * True when the logged-in user is the expected actor for the current
 * step. Mirrors the server-side `canActOnStep` so the action bar only
 * renders for whoever can actually use it — needed after the bypass
 * was tightened to SUPER_ADMIN only (ADMINs without an explicit step
 * assignment now 403 on the approve endpoint).
 */
function canActOnCurrentStep(me: any, rfq: any): boolean {
  if (!me || !rfq?.approval) return false;
  if (rfq.approval.status !== "pending_approval") return false;
  const step = rfq.approval.workflow?.steps?.find(
    (s: any) => s.stepOrder === rfq.approval.currentStepOrder,
  );
  if (!step) return false;
  return canActOnStep(
    {
      userId: me.userId,
      roleKey: me.roleKey,
      projectIds: me.projectIds,
    },
    {
      approverUserId: step.approverUserId,
      approverUserIds: Array.isArray(step.approverUserIds) ? step.approverUserIds : null,
      approverRoleId: step.approverRoleId,
    },
    rfq.projectId ?? null,
  );
}

export default function RFQDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: rfq, isLoading } = useRFQ(id);
  const submitMutation = useSubmitRFQ();
  const { me } = usePermissions();
  // Pre-fetch the source Indent so the sidebar card can surface its
  // "Ref: <PR>" line even before the peek modal is opened.
  const { data: sourceIndent } = useIndent(rfq?.sourceIndentId ?? null);
  const [peekTarget, setPeekTarget] = useState<{ type: SourceDocType; id: string } | null>(null);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const lines: any[] = useMemo(() => rfq?.lines ?? [], [rfq]);
  const vendors: any[] = useMemo(() => rfq?.vendors ?? [], [rfq]);
  const totalQty = useMemo(
    () => lines.reduce((sum: number, l: any) => sum + lineQty(l), 0),
    [lines]
  );

  // `assignedItemIds` stores row keys like `row-0` (index into `lines`);
  // resolve them to material names so the vendor card reads naturally.
  // An empty selection is the "send all items" default — match that
  // convention from the create drawer.
  const itemsForVendor = (v: any): string[] => {
    const ids: string[] = Array.isArray(v.assignedItemIds) ? v.assignedItemIds : [];
    if (ids.length === 0) return lines.map((l) => l.itemName || l.itemId || "—");
    return ids
      .map((id) => {
        const m = /^row-(\d+)$/.exec(String(id));
        if (!m) return null;
        const idx = parseInt(m[1], 10);
        const line = lines[idx];
        return line ? line.itemName || line.itemId || "—" : null;
      })
      .filter((x): x is string => !!x);
  };

  if (isLoading) return <PageSkeleton />;
  if (!rfq) {
    return (
      <PageContainer>
        <p className="text-gray-500 py-12 text-center">RFQ not found</p>
      </PageContainer>
    );
  }

  const handleSubmit = () => {
    setSubmitError(null);
    setSubmitConfirmOpen(true);
  };

  const doSubmit = async (overrides?: {
    emailHtmlBodies?: Record<string, string>;
  }) => {
    try {
      await submitMutation.mutateAsync({
        id,
        ...(overrides?.emailHtmlBodies &&
        Object.keys(overrides.emailHtmlBodies).length > 0
          ? { emailHtmlBodies: overrides.emailHtmlBodies }
          : {}),
      });
      setSubmitConfirmOpen(false);
    } catch (err: any) {
      // Keep the dialog open so the user can read the failure reason.
      setSubmitError(err?.message ?? "Failed to submit RFQ");
    }
  };

  return (
    <>
      <PageHeader
        title={rfq.rfqNumber ?? `RFQ ${id}`}
        subtitle={`Request for Quotation — ${rfq.projectName ?? "—"}`}
        breadcrumbs={[
          { label: "Purchase", href: "/purchase" },
          { label: "RFQ", href: "/purchase/rfqs" },
          { label: rfq.rfqNumber ?? id },
        ]}
        onBack={() => router.push("/purchase/rfqs")}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip status={rfq.status} />
            {rfq.status === "draft" && (
              <PrimaryButton onClick={handleSubmit} disabled={submitMutation.isPending}>
                <Send className="w-4 h-4" /> Submit for Approval
              </PrimaryButton>
            )}
            <ApprovalActionBar
              entityType="rfq"
              entityId={id}
              currentStatus={rfq.status}
              requiredPermission="purchase.po.approve_l1"
              actionEndpoint={`/api/purchase/rfqs/${id}/approve`}
              invalidateKeys={[["rfqs"], ["rfq", id]]}
              actionableStatuses={["submitted", "pending_approval"]}
              // Workflow-aware gating — only the current-step actor
              // sees live buttons.
              hidden={!canActOnCurrentStep(me, rfq)}
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
                <InfoField label="RFQ Number" value={rfq.rfqNumber} />
                <InfoField label="Project" value={rfq.projectName} />
                <InfoField label="RFQ Date" value={rfq.rfqDate} />
                <InfoField label="Due Date" value={rfq.dueDate ?? "—"} />
                <InfoField
                  label="Source Indent"
                  value={
                    rfq.sourceIndentNumber ? (
                      <span className="font-mono text-xs text-indigo-600">
                        {rfq.sourceIndentNumber}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 italic">—</span>
                    )
                  }
                />
                <InfoField label="Items" value={`${lines.length} items`} />
                <InfoField label="Status" value={<StatusChip status={rfq.status} />} />
                <InfoField
                  label="Total Qty"
                  value={totalQty.toLocaleString("en-IN")}
                  highlight
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">
                  Line Items ({lines.length})
                </h3>
              </div>
              {lines.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">
                  No line items
                </div>
              ) : (
                <div className="overflow-auto max-h-[360px]">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-gray-50 z-10">
                      <tr className="border-b border-gray-100">
                        <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase w-8">#</th>
                        <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Material</th>
                        <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-24">Quantity</th>
                        <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase w-16">UOM</th>
                        <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Specification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {lines.map((line: any, i: number) => {
                        const qty = lineQty(line);
                        return (
                          <tr key={line.lineId ?? line.id ?? i}>
                            <td className="px-4 py-3 text-xs text-gray-400">{i + 1}</td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                              {line.itemName ?? line.itemId ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-700 tabular-nums">
                              {qty > 0 ? qty.toLocaleString("en-IN") : "—"}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 uppercase">
                              {line.uomCode ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              {line.specification ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Vendors */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">
                  Vendors ({vendors.length})
                </h3>
              </div>
              {vendors.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">
                  No vendors attached
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {vendors.map((v: any, i: number) => {
                    const items = itemsForVendor(v);
                    const sendAll =
                      !Array.isArray(v.assignedItemIds) ||
                      v.assignedItemIds.length === 0;
                    return (
                      <li key={v.id ?? v.vendorId ?? i} className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="text-sm font-semibold text-gray-900">
                                {v.vendorName || v.vendorId || "—"}
                              </span>
                              {v.email && (
                                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                  <Mail className="w-3 h-3" />
                                  {v.email}
                                </span>
                              )}
                              {v.vendorId && items.length > 0 && (
                                <a
                                  href={`/api/purchase/rfqs/${id}/preview/pdf?vendorId=${encodeURIComponent(v.vendorId)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 hover:underline"
                                  title="Open the PDF that is attached to this vendor's email"
                                >
                                  <Eye className="w-3 h-3" />
                                  View PDF
                                </a>
                              )}
                            </div>
                            <div className="mt-2">
                              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                                {sendAll
                                  ? `Items (All ${items.length})`
                                  : `Items (${items.length})`}
                              </p>
                              {items.length === 0 ? (
                                <span className="text-xs text-gray-400 italic">
                                  No items assigned
                                </span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {items.map((name, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px]"
                                    >
                                      {name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Source Indent card — clicking anywhere on it navigates
                to the Indent detail page. The grandparent PR is only
                a hop away from the indent itself, so we don't need a
                cross-link here (it confused users who expected the
                "Indent Details" card to stay within the indent). */}
            {rfq.sourceIndentId && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Indent Details
                </h3>
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/purchase/indents/${rfq.sourceIndentId}`)
                    }
                    className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 hover:bg-indigo-100"
                    title="Open Indent details"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/purchase/indents/${rfq.sourceIndentId}`)
                      }
                      className="text-sm font-semibold text-gray-900 font-mono truncate hover:text-indigo-700 text-left"
                    >
                      {rfq.sourceIndentNumber ?? rfq.sourceIndentId}
                    </button>
                    {sourceIndent?.indentDate && (
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Date: {sourceIndent.indentDate}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Approval Timeline — mirrors the PR / Indent detail sidebar.
                Renders one row per workflow step plus a leading "Requested"
                entry, with completed steps showing the actor + time and
                pending steps labelled "Awaiting action" / "Not yet reached". */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Approval Timeline
              </h3>
              {!rfq.approval ? (
                <p className="text-sm text-gray-500">
                  Not yet submitted for approval.
                </p>
              ) : (
                (() => {
                  const entries: any[] = [
                    {
                      step: 0,
                      action: "request",
                      title: "Requested",
                      actionBy: rfq.approval.requestedByName || "Requester",
                      actionAt: new Date(rfq.approval.requestedAt).toLocaleString(),
                    },
                  ];

                  rfq.approval.workflow.steps.forEach((s: any) => {
                    const acted = [...rfq.approval.history]
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
                      rfq.approval.status === "pending_approval" &&
                      rfq.approval.currentStepOrder === s.stepOrder;
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
                  value={rfq.createdAt ? new Date(rfq.createdAt).toLocaleString() : "—"}
                />
                <InfoField
                  label="Created By"
                  value={rfq.createdByName ?? rfq.createdBy ?? "—"}
                />
                {rfq.updatedAt && (
                  <InfoField
                    label="Last Updated"
                    value={new Date(rfq.updatedAt).toLocaleString()}
                  />
                )}
                {(rfq.updatedByName || rfq.updatedBy) && (
                  <InfoField
                    label="Last Updated By"
                    value={rfq.updatedByName ?? rfq.updatedBy}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </PageContainer>

      <SourceDocPeekModal
        open={!!peekTarget}
        initial={peekTarget}
        onClose={() => setPeekTarget(null)}
      />

      <RfqSubmitPreviewModal
        open={submitConfirmOpen}
        rfqId={id}
        rfqNumber={rfq.rfqNumber ?? null}
        onClose={() => {
          if (!submitMutation.isPending) {
            setSubmitConfirmOpen(false);
            setSubmitError(null);
          }
        }}
        onConfirm={doSubmit}
        submitting={submitMutation.isPending}
        submitError={submitError}
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
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
        {label}
      </p>
      <div
        className={`text-sm mt-0.5 ${
          highlight ? "font-bold text-gray-900" : "text-gray-700"
        }`}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}
