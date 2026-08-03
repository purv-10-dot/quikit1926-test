"use client";

import { formatDateTimeIST } from "@/lib/format/datetime";
import { type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Package, Download, Send, FileText, Mail, X as XIcon, Lock, AlertTriangle } from "lucide-react";
import dynamic from "next/dynamic";
const PoSubmitPreviewModal = dynamic(
  () => import("@/components/PoSubmitPreviewModal").then((m) => m.PoSubmitPreviewModal),
  { ssr: false },
);
import {
  PageHeader, PageContainer, StatusChip,
  PrimaryButton, SecondaryButton, ApprovalTimeline, PageSkeleton,
} from "@/components/PageShell";
import { USER_TYPE_CATALOG } from "@/lib/rbac/user-types";

// Human-friendly role key → label for workflow step display.
function roleLabel(key: string | null | undefined): string {
  if (!key) return "Any approver";
  return USER_TYPE_CATALOG.find((t) => t.key === key)?.label ?? key;
}

import type {
  ApprovalStep,
  ApprovalHistoryEntry,
  ApprovalInfo,
} from "@/lib/approvals/approval-info";
import type { PoLine, PoDetail } from "@/lib/purchase/po-detail";
import type { ItemRow, MailOutcome, TimelineEntry } from "./lib/types";
import { canActOnCurrentStep } from "./lib/utils";
import { useOrderDetail } from "./lib/useOrderDetail";
import { InfoField } from "./components/detail-parts";
import { LineItemsPanel } from "./components/LineItemsPanel";


import { ApprovalActionBar } from "@/components/ApprovalActionBar";
import type { SourceDocType } from "@/components/SourceDocPeekModal";
const SourceDocPeekModal = dynamic(
  () => import("@/components/SourceDocPeekModal").then((m) => m.SourceDocPeekModal),
  { ssr: false },
);
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";

export default function PODetailPage() {
  const { id } = useParams<{ id: string }>();
  const {
    router, qc, po, isLoading, submitMutation, me,
    drawerOpen, setDrawerOpen,
    peekTarget, setPeekTarget,
    submitConfirmOpen, setSubmitConfirmOpen,
    submitError, setSubmitError,
    closeOpen, setCloseOpen,
    overduePromptOpen, setOverduePromptOpen,
    closeReason, setCloseReason,
    closing, setClosing,
    closeError, setCloseError,
    mailToast, setMailToast,
    startClose, doClose, doSubmit, handleSubmit, fmtDateTime,
    projectOptions, locationOptions,
    grnConfig, grnInitialLines, todayStr,
  } = useOrderDetail(id);

  if (isLoading) return <PageSkeleton />;
  if (!po) return <PageContainer><p className="text-gray-500 py-12 text-center">PO not found</p></PageContainer>;

  const vendorName = po.vendorName ?? po.vendor?.name ?? "—";
  const lines: PoLine[] = po.lines ?? [];
  const totalAmount = parseFloat(String(po.totalAmount ?? "0")) || 0;
  const taxAmount = parseFloat(String(po.taxAmount ?? "0")) || 0;
  const subtotal = totalAmount - taxAmount;

  return (
    <>
      <PageHeader
        title={po.poNumber ?? `PO ${id}`}
        subtitle={`Purchase Order — ${vendorName}`}
        breadcrumbs={[
          { label: "Purchase", href: "/purchase" },
          { label: "Purchase Orders", href: "/purchase/orders" },
          { label: po.poNumber ?? id },
        ]}
        onBack={() => router.push("/purchase/orders")}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip status={po.status ?? ""} />
            {po.status === "draft" && (
              <PrimaryButton onClick={handleSubmit} disabled={submitMutation.isPending}>
                <Send className="w-4 h-4" /> Submit for Approval
              </PrimaryButton>
            )}
            {["approved", "sent", "partially_received"].includes(
              po.status ?? "",
            ) && (
              <PrimaryButton
                onClick={() => router.push(`/store/grn?poId=${id}`)}
              >
                <Package className="w-4 h-4" /> Create GRN
              </PrimaryButton>
            )}
            {/* Close PO — only when overdue and not already in a
                terminal state. Same set of statuses the popup keys
                off, so the button and the popup come and go together. */}
            {po.isOverdue && po.status !== "closed" && po.status !== "fully_received" && (
              <button
                type="button"
                onClick={startClose}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors"
                title="Close this PO with a reason"
              >
                <Lock className="w-3.5 h-3.5" /> Close PO
              </button>
            )}
            <ApprovalActionBar
              entityType="po"
              entityId={id}
              currentStatus={po.status ?? undefined}
              requiredPermission="purchase.po.approve_l1"
              actionEndpoint={`/api/purchase/orders/${id}/approve`}
              invalidateKeys={[["purchase-orders"], ["purchase-order", id]]}
              actionableStatuses={["submitted", "pending_l1", "pending_l2", "pending_approval"]}
              // Workflow-aware gating — opts out of the legacy permission
              // check so only the current-step actor sees live buttons.
              hidden={!canActOnCurrentStep(me, po)}
            />
          </div>
        }
      />

      {/* "Closed" banner — shown when the user has manually closed
          the PO. Surfaces who closed it, when, and the reason so the
          audit trail is visible without digging into the activity log. */}
      {po.status === "closed" && (
        <PageContainer>
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
            <Lock className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-rose-900">
                This PO has been closed
              </div>
              <div className="text-xs text-rose-800 mt-1">
                Closed on {fmtDateTime(po.closedAt)}
                {po.closedBy ? ` by ${po.closedBy}` : ""}.
              </div>
              {po.closeReason && (
                <div className="text-xs text-rose-800 mt-2 bg-white/60 border border-rose-200 rounded-md px-3 py-2">
                  <span className="font-semibold">Reason: </span>
                  {po.closeReason}
                </div>
              )}
            </div>
          </div>
        </PageContainer>
      )}

      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* PO Header */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoField label="PO Number" value={po.poNumber} bold />
                <InfoField label="PO Date" value={po.poDate} />
                <InfoField label="Delivery Date" value={po.deliveryDate ?? "—"} />
                <InfoField label="Status" value={<StatusChip status={po.status ?? ""} />} />
                <InfoField label="Vendor" value={vendorName} />
                <InfoField label="Project" value={po.projectName ?? "—"} />
                <InfoField label="Payment Terms" value={po.paymentTerms ?? "—"} />
                <InfoField label="Total Amount" value={`₹ ${totalAmount.toLocaleString("en-IN")}`} bold />
              </div>
            </div>

            {/* Line Items */}
            <LineItemsPanel
              po={po}
              lines={lines}
              subtotal={subtotal}
              totalAmount={totalAmount}
              taxAmount={taxAmount}
              vendorName={vendorName}
            />

            {/* Terms & Conditions — the snapshot saved on this PO, which
                is exactly what the vendor PDF carries. Independent of the
                master template: later master edits don't change it. */}
            {(po.termsAndConditions ?? "").trim() && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Terms &amp; Conditions
                  </h3>
                </div>
                <div className="px-5 py-4">
                  <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-gray-700 max-h-80 overflow-y-auto">
                    {po.termsAndConditions}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Source RFQ / Indent card — click the number to open the
                immediate parent peek; click the Ref line to jump straight
                to the grandparent document. */}
            {/* Render the source card ONLY when we actually have a
                human-readable doc number to display. An empty
                number + a lingering id (legacy rows) would show the
                "RFQ Details" header with just the PO-raised date
                underneath, which reads as a broken card. */}
            {((po.sourceRfqId && po.sourceRfqNumber) ||
              (po.sourceIndentId && po.sourceIndentNumber)) && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                  {po.sourceRfqId ? "RFQ Details" : "Indent Details"}
                </h3>
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        po.sourceRfqId
                          ? `/purchase/rfqs/${po.sourceRfqId}`
                          : `/purchase/indents/${po.sourceIndentId}`,
                      )
                    }
                    className="w-9 h-9 rounded-lg bg-accent-50 text-accent-600 flex items-center justify-center shrink-0 hover:bg-accent-100"
                    title="Open source document"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          po.sourceRfqId
                            ? `/purchase/rfqs/${po.sourceRfqId}`
                            : `/purchase/indents/${po.sourceIndentId}`,
                        )
                      }
                      className="text-sm font-semibold text-gray-900 truncate hover:text-accent-700 text-left"
                    >
                      {po.sourceRfqNumber ?? po.sourceIndentNumber ?? "—"}
                    </button>
                    {po.poDate && (
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        PO raised: {po.poDate}
                      </div>
                    )}
                    {/* Grandparent (indent) cross-link removed: the
                        modal that supported chained nav is gone, and
                        users expect the "RFQ Details" card to stay
                        anchored on the RFQ. The indent is one hop
                        away from the RFQ page itself. */}
                  </div>
                </div>
              </div>
            )}

            {/* Approval Timeline — mirrors PR / Indent / RFQ. Shows
                Requested → per-step progress (Completed / Next /
                Upcoming). Relies on `po.approval` being populated by
                the GET endpoint (cnApprovalInstance + history). */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Approval Timeline
              </h3>
              {po.status === "draft" ? (
                <p className="text-sm text-gray-500">
                  Not yet submitted for approval.
                </p>
              ) : !po.approval ? (
                <p className="text-sm text-gray-500">
                  Submitted, but no approval instance is linked to this PO.
                </p>
              ) : (
                (() => {
                  const approval = po.approval!;
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
                        action: acted.action,
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

            {/* Vendor Details + Order Summary moved to the main
                column so the key info and totals sit inline with
                the PO items. The sidebar keeps only contextual
                cards (Source doc, Approval timeline, Audit). */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Audit</h3>
              <div className="space-y-2 text-xs text-gray-500">
                <p>Created: {formatDateTimeIST(po.createdAt)}</p>
                <p>By: {po.createdByName ?? po.createdBy ?? "—"}</p>
              </div>
            </div>
          </div>
        </div>
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={grnConfig} />

      <SourceDocPeekModal
        open={!!peekTarget}
        initial={peekTarget}
        onClose={() => setPeekTarget(null)}
      />

      <PoSubmitPreviewModal
        open={submitConfirmOpen}
        poId={id}
        poNumber={po.poNumber ?? null}
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

      {/* ── Overdue prompt ──────────────────────────────────────────
          Triggered by the header "Close PO" button when the PO is
          overdue. Two choices: continue to the reason modal, or back
          out without closing. */}
      {overduePromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900">
                  Delivery date has passed
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  PO {po.poNumber} · expected by {po.deliveryDate || "—"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOverduePromptOpen(false)}
                className="text-gray-400 hover:text-gray-600 shrink-0"
                title="Cancel"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 text-sm text-gray-700">
              The materials for this PO weren't received by the planned
              delivery date. Do you want to close this PO?
              <p className="text-[11px] text-gray-500 mt-2">
                You'll be asked to enter a reason on the next step.
              </p>
            </div>
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOverduePromptOpen(false)}
                className="px-4 py-1.5 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setOverduePromptOpen(false);
                  setCloseOpen(true);
                }}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors inline-flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" /> Yes, close it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Close-with-reason modal ─────────────────────────────────
          Reason is required (server enforces too). Used by both the
          "Close PO" header button and the overdue prompt's "Yes" path. */}
      {closeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900">
                  Close PO {po.poNumber}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  This locks the PO. New GRNs cannot be posted against it.
                </div>
              </div>
            </div>
            <div className="px-5 py-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Reason for closing <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                rows={4}
                autoFocus
                disabled={closing}
                placeholder="e.g. Vendor failed to deliver — switched to alternate supplier on PO-COMSYN-26-0007"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400 disabled:bg-gray-50"
              />
              <div className="text-[11px] text-gray-500 mt-1">
                {closeReason.trim().length}/500 — required for the audit trail.
              </div>
              {closeError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {closeError}
                </div>
              )}
            </div>
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !closing && setCloseOpen(false)}
                disabled={closing}
                className="px-4 py-1.5 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doClose}
                disabled={closing || !closeReason.trim()}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Lock className="w-3.5 h-3.5" />
                {closing ? "Closing…" : "Close PO"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Vendor-email toast ─────────────────────────────────────
          Floats top-center, anchored just below the page header.
          Used by BOTH the PO Submit flow (notifies vendor of the new
          PO) and the Close PO flow (notifies vendor of cancellation).
          Auto-dismisses after 6s — see the useEffect above.

          The slide-down-and-fade-in animation is inlined as a <style>
          tag below so the toast doesn't depend on tailwindcss-animate
          (which isn't installed in this project). */}
      <style jsx>{`
        @keyframes mailToastIn {
          from { opacity: 0; transform: translate(-50%, -16px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        .mail-toast-anim { animation: mailToastIn 280ms cubic-bezier(0.16, 1, 0.3, 1) both; }
      `}</style>
      {mailToast && (
        <div className="fixed top-20 left-1/2 z-50 w-full max-w-md px-4 pointer-events-none mail-toast-anim" style={{ transform: "translateX(-50%)" }}>
          <div
            role="status"
            aria-live="polite"
            className={`pointer-events-auto rounded-xl shadow-2xl border-2 p-4 flex items-start gap-3 backdrop-blur-sm ${
              mailToast.tone === "success"
                ? "bg-emerald-50/95 border-emerald-300 text-emerald-900"
                : "bg-amber-50/95 border-amber-300 text-amber-900"
            }`}
          >
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                mailToast.tone === "success"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              <Mail className="w-4.5 h-4.5" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="text-xs font-bold uppercase tracking-wider opacity-70">
                {mailToast.tone === "success" ? "Email sent" : "Email not delivered"}
              </div>
              <div className="text-sm font-medium mt-0.5 break-words">
                {mailToast.text}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMailToast(null)}
              className="text-current opacity-50 hover:opacity-100 shrink-0 -mt-1 -mr-1 p-1 rounded hover:bg-black/5"
              aria-label="Dismiss"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

