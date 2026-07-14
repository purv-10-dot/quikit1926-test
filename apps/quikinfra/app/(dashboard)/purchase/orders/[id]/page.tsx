"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { formatDateTimeIST } from "@/lib/format/datetime";
import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Package, Download, Send, FileText, Mail, Phone, X as XIcon, Lock, AlertTriangle } from "lucide-react";
import { WhatsAppLink } from "@/components/WhatsAppLink";
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

interface ItemRow {
  id: string;
  name?: string;
  uomCode?: string;
}

interface MailOutcome {
  sent?: boolean;
  email?: string;
  to?: string;
  skippedReason?: string;
  error?: string;
}

/** Matches PageShell's ApprovalTimeline entry shape. */
interface TimelineEntry {
  step: number;
  action: string;
  actionBy: string;
  actionAt: string;
  comments?: string;
  title?: string;
}

/**
 * True when the logged-in user is the expected actor for the current
 * step. Mirrors the server-side `canActOnStep` so the Approve / Reject /
 * Return buttons only render for the actor who can actually use them.
 * Without this gate, ADMIN userTypes (and anyone with a stale matrix
 * permission) would see live buttons that the server now 403s on after
 * the bypass was tightened to SUPER_ADMIN only.
 */
function canActOnCurrentStep(
  me: MeResponse | null | undefined,
  po: PoDetail | null | undefined,
): boolean {
  if (!me || !po?.approval) return false;
  if (po.approval.status !== "pending_approval") return false;
  const step = po.approval.workflow?.steps?.find(
    (s: ApprovalStep) => s.stepOrder === po.approval?.currentStepOrder,
  );
  if (!step) return false;
  return canActOnStep(
    {
      userId: me.userId,
      roleKey: me.roleKey,
      projectIds: me.projectIds ?? undefined,
    },
    {
      approverUserId: step.approverUserId ?? null,
      approverUserIds: Array.isArray(step.approverUserIds) ? step.approverUserIds : null,
      approverRoleId: step.approverRoleId ?? null,
    },
    po.projectId ?? null,
  );
}
import { usePurchaseOrder, useSubmitPO } from "@/hooks/use-purchase";
import { ApprovalActionBar } from "@/components/ApprovalActionBar";
import { usePermissions, type MeResponse } from "@/hooks/use-permissions";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";
import type { SourceDocType } from "@/components/SourceDocPeekModal";
const SourceDocPeekModal = dynamic(
  () => import("@/components/SourceDocPeekModal").then((m) => m.SourceDocPeekModal),
  { ssr: false },
);
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import { useProjects, useItems, useLocations } from "@/hooks/use-masters";
import { useQueryClient } from "@tanstack/react-query";
import { renderGrnLine } from "@/components/GrnLineRow";
import { buildGrnFields } from "@/lib/grn-form-fields";

export default function PODetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: po, isLoading } = usePurchaseOrder(id);
  const submitMutation = useSubmitPO();
  const { me } = usePermissions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [peekTarget, setPeekTarget] = useState<{ type: SourceDocType; id: string } | null>(null);
  // Submit-confirmation dialog state. Browser `confirm()` was ugly
  // (the "localhost says" alert) and blocked the render thread, so
  // we use the shared `ConfirmDialog` that's already in use on PR /
  // Indent / RFQ for the same action.
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Close PO state ────────────────────────────────────────────────
  // The flow is purely user-initiated — no auto-popup on page load.
  // Clicking the header "Close PO" button opens `overduePromptOpen`
  // (the "delivery date passed — close this PO?" warning). Saying
  // "Yes, close it" closes that popup and opens `closeOpen` (the
  // reason-required modal).
  const [closeOpen, setCloseOpen] = useState(false);
  const [overduePromptOpen, setOverduePromptOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  // Transient toast for cancellation-email outcome — surfaces whether
  // the vendor was notified after a successful close. Auto-dismisses.
  const [mailToast, setMailToast] = useState<{ tone: "success" | "warn"; text: string } | null>(null);

  // Auto-dismiss the mail toast after 6s so the page doesn't keep a
  // stale notification pinned forever.
  useEffect(() => {
    if (!mailToast) return;
    const t = setTimeout(() => setMailToast(null), 6000);
    return () => clearTimeout(t);
  }, [mailToast]);

  // The header "Close PO" button calls this. If the PO is overdue,
  // surface the warning popup first; otherwise jump straight to the
  // reason modal.
  const startClose = () => {
    setCloseReason("");
    setCloseError(null);
    if (po?.isOverdue) {
      setOverduePromptOpen(true);
    } else {
      setCloseOpen(true);
    }
  };

  const doClose = async () => {
    const trimmed = closeReason.trim();
    if (!trimmed) {
      setCloseError("Please enter a reason for closing this PO");
      return;
    }
    setClosing(true);
    setCloseError(null);
    try {
      const res = await fetch(`/api/purchase/orders/${id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      qc.invalidateQueries({ queryKey: ["purchase-order", id] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });

      // Surface vendor-notification status as a transient toast so
      // the user knows whether the cancellation email actually went
      // out. Mailer failures don't block the close (the DB write has
      // already committed) — they're informational only.
      const mail = json?.email ?? null;
      if (mail) {
        if (mail.sent) {
          setMailToast({
            tone: "success",
            text: `Cancellation email sent to ${mail.to}.`,
          });
        } else {
          setMailToast({
            tone: "warn",
            text: mail.skippedReason
              ? `Vendor not notified — ${mail.skippedReason}.`
              : `Vendor email not sent — ${mail.error ?? "unknown error"}.`,
          });
        }
      }
      setCloseOpen(false);
    } catch (err: unknown) {
      setCloseError(toErrorMessage(err, "Failed to close PO"));
    } finally {
      setClosing(false);
    }
  };

  const fmtDateTime = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
  };

  const handleSubmit = () => {
    setSubmitError(null);
    setSubmitConfirmOpen(true);
  };

  const doSubmit = async (overrides?: { emailHtmlBody?: string }) => {
    setSubmitError(null);
    try {
      const result = (await submitMutation.mutateAsync({
        id,
        ...(overrides?.emailHtmlBody
          ? { emailHtmlBody: overrides.emailHtmlBody }
          : {}),
      })) as { mail?: MailOutcome } | null;
      setSubmitConfirmOpen(false);

      // Reuse the same shared toast UI that the Close PO flow uses so
      // the user gets identical feedback whether the system just sent
      // a PO email or a cancellation email. Submit endpoint returns
      // the mailer outcome under `mail`.
      const mail = result?.mail ?? null;
      if (mail) {
        if (mail.sent) {
          setMailToast({
            tone: "success",
            text: `PO email sent to ${mail.email}.`,
          });
        } else if (mail.skippedReason || mail.error) {
          setMailToast({
            tone: "warn",
            text: mail.skippedReason
              ? `Vendor not notified — ${mail.skippedReason}.`
              : `Vendor email not sent — ${mail.error ?? "unknown error"}.`,
          });
        }
      }
    } catch (err: unknown) {
      // Keep the dialog open so the user can read the failure reason.
      setSubmitError(toErrorMessage(err, "Failed to submit PO"));
    }
  };

  const { data: projectsData } = useProjects();
  const { data: itemsData } = useItems();
  const { data: locationsData } = useLocations();

  const projectOptions = (projectsData?.data ?? []).map((p) => ({ value: p.id, label: p.name }));
  const itemOptions = (itemsData?.data ?? []).map((i) => ({ value: i.id, label: i.name }));
  const locationOptions = (locationsData?.data ?? []).filter((l) => l?.status === "active").map((l) => ({ value: l.id, label: l.name }));

  // Client-side items lookup so the table can backfill material
  // name / UOM when the stored PO line has empty strings (happens
  // when the save-time item resolver couldn't hit the master).
  const itemById = new Map<string, ItemRow>(
    (itemsData?.data ?? []).map((i) => [i.id, i]),
  );

  // Today's date in yyyy-MM-dd format for the GRN date default.
  const todayStr = new Date().toISOString().slice(0, 10);

  // Pre-populated line items derived from the PO. One row per PO
  // line; reference columns (Material, UOM, PO Qty, Prev. Rcvd,
  // Pending) are filled in so the user only types Received /
  // Rejected / Batch / Condition.
  const grnInitialLines = (po?.lines ?? []).map((l: PoLine) => {
    const master = l.itemId ? itemById.get(l.itemId) : null;
    const poQty = parseFloat(String(l.poQty ?? l.quantity ?? "0")) || 0;
    const prevRcvd = parseFloat(String(l.receivedQty ?? "0")) || 0;
    return {
      itemId: l.itemId,
      itemName: l.itemName || master?.name || "",
      uomCode: l.uomCode || master?.uomCode || "",
      poQty: String(poQty),
      prevRcvd: String(prevRcvd),
      pending: String(Math.max(poQty - prevRcvd, 0)),
      receivedQty: "",
      rejectedQty: "",
      batchNo: "",
      condition: "Good",
      testCertRef: "",
      remarks: "",
    };
  });

  const grnConfig = {
    title: "Create GRN from PO",
    subtitle: `Record goods receipt for ${po?.poNumber ?? "this PO"}`,
    apiEndpoint: "/api/purchase/grn",
    onSuccess: (created: unknown) => {
      qc.invalidateQueries({ queryKey: ["grns"] });
      qc.invalidateQueries({ queryKey: ["purchase-order", id] });
      // Jump straight to the new GRN so the user can review / submit
      // for approval without re-finding it in the list.
      const c = created as { id?: string; data?: { id?: string } } | null;
      const newId = c?.id ?? c?.data?.id;
      if (newId) router.push(`/store/grn/${newId}`);
    },
    initialLines: grnInitialLines,
    // Shared field list — identical layout + fields to the main GRN
    // drawer in `/store/grn`. The only thing that differs is the PO
    // Reference field: here it's a pre-filled disabled text (the PO
    // is fixed by this detail page), in the GRN list it's a picker.
    fields: buildGrnFields({
      poRefField: {
        key: "poRef",
        label: "PO Reference",
        type: "text" as const,
        defaultValue: po?.poNumber ?? "",
        placeholder: "PO number",
        disabled: true,
      },
      projectOptions,
      locationOptions,
      grnDateDefault: todayStr,
      vendorDefault: po?.vendorName ?? "",
      invoiceValueDefault:
        po?.totalAmount != null ? String(po.totalAmount) : "",
      storageLocationDefault: po?.deliveryLocationId ?? "",
      projectDefault: po?.projectId ?? "",
    }),
    lineItems: {
      label: "Received Items",
      hideAddLine: true,
      // Identical card layout to the main GRN drawer — both entry
      // points share `renderGrnLine` so the UX is pixel-for-pixel
      // the same and bug fixes ship to both places at once.
      rowRender: renderGrnLine,
      // `fields` is kept so the drawer's payload serialisation still
      // picks up every line key — the default grid is bypassed by
      // `rowRender` above. Every key here is emitted in the POST.
      fields: [
        { key: "itemId", label: "itemId", type: "text" as const },
        { key: "itemName", label: "itemName", type: "text" as const },
        { key: "uomCode", label: "uomCode", type: "text" as const },
        { key: "poQty", label: "poQty", type: "number" as const },
        { key: "prevRcvd", label: "prevRcvd", type: "number" as const },
        { key: "receivedQty", label: "receivedQty", type: "number" as const },
        { key: "rejectedQty", label: "rejectedQty", type: "number" as const },
        { key: "batchNo", label: "batchNo", type: "text" as const },
        { key: "condition", label: "condition", type: "text" as const },
        { key: "testCertRef", label: "testCertRef", type: "text" as const },
        { key: "remarks", label: "remarks", type: "text" as const },
      ],
    },
  };

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
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">
                  PO Line Items ({lines.length || po.lineCount || 0})
                </h3>
              </div>
              {lines.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">
                  {po.lineCount ? `${po.lineCount} items (details available in full view)` : "No line items"}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase w-8">#</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Material</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase w-16">UOM</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-20">Qty</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-24">Rate</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-28">Amount</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-28">GST</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-28">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {lines.map((line: PoLine, i: number) => {
                        // Field-name tolerance — stored shape uses
                        // `poQty` / `lineValueExGST` / `lineValueIncGST`,
                        // older rows used `quantity` / `amount` /
                        // `totalAmount`. Backfill item name/uom from
                        // the items master when the stored row has
                        // empty strings (happened when the save-time
                        // resolver missed Prisma).
                        const master = line.itemId
                          ? itemById.get(line.itemId)
                          : null;
                        const matName =
                          line.itemName ||
                          master?.name ||
                          line.itemCode ||
                          line.itemId ||
                          "—";
                        const uom =
                          line.uomCode || master?.uomCode || "—";
                        const qty =
                          line.poQty ??
                          line.quantity ??
                          line.orderedQty ??
                          "—";
                        const rate = Number(
                          line.unitRate ?? line.rate ?? 0,
                        );
                        const amount = Number(
                          line.lineValueExGST ??
                            line.amount ??
                            line.totalAmount ??
                            rate * (parseFloat(String(qty)) || 0),
                        );
                        const net = Number(
                          line.lineValueIncGST ??
                            line.netAmount ??
                            amount,
                        );
                        // Per-line GST split — reads the server-stored
                        // igst/cgst/sgst amounts. Inter-state lines carry
                        // IGST, intra-state carry CGST + SGST.
                        const lIgst = Number(line.igstAmount ?? 0);
                        const lCgst = Number(line.cgstAmount ?? 0);
                        const lSgst = Number(line.sgstAmount ?? 0);
                        const lHasSplit = lIgst + lCgst + lSgst > 0;
                        const lGstType =
                          line.gstType ?? (lIgst > 0 ? "IGST" : "CGST+SGST");
                        const fmtLine = (n: number) =>
                          `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
                        return (
                          <tr key={line.id ?? line.lineId ?? i}>
                            <td className="px-3 py-3 text-xs text-gray-400">{i + 1}</td>
                            <td className="px-3 py-3 text-sm font-medium text-gray-900">
                              {matName}
                            </td>
                            <td className="px-3 py-3 text-xs text-gray-600 uppercase">
                              {uom}
                            </td>
                            <td className="px-3 py-3 text-sm text-right tabular-nums">
                              {qty}
                            </td>
                            <td className="px-3 py-3 text-sm text-right tabular-nums">
                              ₹ {rate.toLocaleString("en-IN")}
                            </td>
                            <td className="px-3 py-3 text-sm text-right font-medium tabular-nums">
                              ₹ {amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-3 text-xs text-right tabular-nums text-gray-600">
                              <div>{line.gstRate != null ? `${line.gstRate}%` : "—"}</div>
                              {lHasSplit && (
                                <div className="text-[10px] text-gray-400 leading-tight mt-0.5">
                                  {lGstType === "IGST" ? (
                                    <div>IGST {fmtLine(lIgst)}</div>
                                  ) : (
                                    <>
                                      <div>CGST {fmtLine(lCgst)}</div>
                                      <div>SGST {fmtLine(lSgst)}</div>
                                    </>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-sm text-right font-semibold tabular-nums text-gray-900">
                              ₹ {net.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Finance breakdown — 6 stat pills for the key
                  line-level aggregates (Amount → Line Disc → Net →
                  GST → Freight → Other) plus a Grand Total row at
                  the bottom. Mirrors the printed PO so the approver
                  sees every moving part of the total at a glance. */}
              {lines.length > 0 && (() => {
                let gross = 0, lineDisc = 0, net = 0, tax = 0;
                for (const l of lines) {
                  const q = parseFloat(String(l.poQty ?? l.quantity ?? 0)) || 0;
                  const r = parseFloat(String(l.unitRate ?? l.rate ?? 0)) || 0;
                  const d = parseFloat(String(l.discount ?? 0)) || 0;
                  const g = parseFloat(String(l.gstRate ?? 0)) || 0;
                  const gr = q * r;
                  const ld = (gr * d) / 100;
                  const ad = gr - ld;
                  gross += gr; lineDisc += ld; net += ad; tax += (ad * g) / 100;
                }
                const freight = parseFloat(String(po.freightCharges ?? "0")) || 0;
                const other = parseFloat(String(po.otherCharges ?? "0")) || 0;
                const hdrDisc = parseFloat(String(po.discount ?? "0")) || 0;
                const grand = net + tax + freight + other - hdrDisc || totalAmount;
                const RUPEE = "\u20B9";
                const fmtINR = (n: number) =>
                  `${RUPEE}${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
                // GST split \u2014 read the server-stored breakup (computed from
                // project/company state vs vendor state). Inter-state POs
                // carry IGST; intra-state POs carry CGST + SGST. Exactly one
                // side is non-zero, so we render whichever the server filled.
                const igst = parseFloat(String(po.totalIGST ?? "0")) || 0;
                const cgst = parseFloat(String(po.totalCGST ?? "0")) || 0;
                const sgst = parseFloat(String(po.totalSGST ?? "0")) || 0;
                const gstType =
                  po.gstType ?? (igst > 0 ? "IGST" : "CGST+SGST");
                const hasGstSplit = igst + cgst + sgst > 0;
                return (
                  <div className="border-t border-gray-100 bg-gradient-to-b from-gray-50/60 to-white">
                    <div
                      className={`grid gap-px bg-gray-200 ${
                        hasGstSplit
                          ? "grid-cols-2 md:grid-cols-4 lg:grid-cols-4"
                          : "grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
                      }`}
                    >
                      <StatCell label="Amount" value={fmtINR(gross)} />
                      <StatCell label="Line Disc." value={fmtINR(lineDisc)} />
                      <StatCell label="Net" value={fmtINR(net)} />
                      {hasGstSplit &&
                        (gstType === "IGST" ? (
                          <StatCell label="IGST" value={fmtINR(igst)} />
                        ) : (
                          <>
                            <StatCell label="CGST" value={fmtINR(cgst)} />
                            <StatCell label="SGST" value={fmtINR(sgst)} />
                          </>
                        ))}
                      <StatCell label="Tax (GST)" value={fmtINR(tax)} />
                      <StatCell
                        label={`Freight (${RUPEE})`}
                        value={freight.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      />
                      <StatCell
                        label={`Other (${RUPEE})`}
                        value={other.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      />
                    </div>
                    {hasGstSplit && (
                      <div className="px-5 py-1.5 border-t border-gray-100 bg-white">
                        <span className="text-[11px] text-gray-400">
                          {gstType === "IGST"
                            ? "Inter-state supply — IGST applicable"
                            : "Intra-state supply — CGST + SGST applicable"}
                        </span>
                      </div>
                    )}
                    <div className="px-5 py-4 bg-gradient-to-r from-orange-50/50 to-transparent border-t border-gray-100 flex items-center justify-between">
                      <span className="text-sm font-bold text-orange-700 uppercase tracking-wider">
                        Total Amount
                      </span>
                      <span className="text-xl font-extrabold tabular-nums text-orange-700">
                        {fmtINR(grand)}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Vendor card — full-width, main-column treatment just
                like the RFQ detail page's Vendors section. Shows
                vendor identity + contact + GST + address, plus an
                item-chip list so the approver can see at a glance
                what this vendor is supplying. */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">
                  Vendor
                </h3>
              </div>
              <div className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-sm font-semibold text-gray-900">
                          {vendorName}
                        </span>
                        {po.vendorEmail && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 break-all">
                            <Mail className="w-3 h-3 shrink-0" />
                            {po.vendorEmail}
                          </span>
                        )}
                        {po.vendorPhone && (
                          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                            <Phone className="w-3 h-3 shrink-0" />
                            {po.vendorPhone}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-auto">
                        <WhatsAppLink
                          phone={String(po.vendorPhone ?? "")}
                          showDisabled
                          message={
                            po.poNumber
                              ? `Hello, regarding Purchase Order ${po.poNumber}.`
                              : undefined
                          }
                          title={
                            po.poNumber
                              ? `WhatsApp vendor about ${po.poNumber}`
                              : "WhatsApp vendor"
                          }
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white hover:bg-[#20bd5a] transition-colors"
                        />
                      </div>
                    </div>
                    {po.vendorContactPerson && (
                      <p className="text-[11px] text-gray-500 mt-1">
                        Contact: {po.vendorContactPerson}
                      </p>
                    )}
                    {po.vendorGSTIN && (
                      <p className="text-[11px] text-gray-500 mt-1">
                        GSTIN: {po.vendorGSTIN}
                      </p>
                    )}
                    {po.vendorAddress && (
                      <p className="text-[11px] text-gray-500 mt-1 whitespace-pre-line">
                        {po.vendorAddress}
                      </p>
                    )}
                    <div className="mt-3">
                      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
                        Items ({lines.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {lines.map((line: PoLine, i: number) => {
                          const master = line.itemId ? itemById.get(line.itemId) : null;
                          const name =
                            line.itemName ||
                            master?.name ||
                            line.itemCode ||
                            line.itemId ||
                            `Item ${i + 1}`;
                          return (
                            <span
                              key={i}
                              className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px]"
                            >
                              {name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
                    className="w-9 h-9 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 hover:bg-orange-100"
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
                      className="text-sm font-semibold text-gray-900 truncate hover:text-orange-700 text-left"
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

function InfoField({ label, value, bold }: { label: string; value: ReactNode; bold?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <div className={`text-sm mt-0.5 ${bold ? "font-bold text-gray-900" : "text-gray-700"}`}>{value ?? "—"}</div>
    </div>
  );
}

// Single finance cell — used to render the 6-pill breakdown row
// (Amount / Line Disc / Net / Tax / Freight / Other) directly under
// the PO line items table. The thin 1px divider between cells is
// painted by the parent's `gap-px` + `bg-gray-200` trick so every
// cell shares a clean gridline without extra markup.
function StatCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
        {label}
      </div>
      <div className="text-base font-bold text-gray-900 tabular-nums mt-1">
        {value}
      </div>
      {sub != null && (
        <div className="text-[10px] text-gray-500 tabular-nums mt-0.5 leading-tight">
          {sub}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-medium tabular-nums text-gray-900">
        {value}
      </span>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-600">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-gray-900">
        {value}
      </span>
    </div>
  );
}
