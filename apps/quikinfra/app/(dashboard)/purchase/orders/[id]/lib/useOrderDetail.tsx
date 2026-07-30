"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { usePurchaseOrder, useSubmitPO } from "@/hooks/use-purchase";
import { usePermissions } from "@/hooks/use-permissions";
import { useProjects, useLocations } from "@/hooks/use-masters";
import { renderGrnLine } from "@/components/GrnLineRow";
import { buildGrnFields } from "@/lib/grn-form-fields";
import type { SourceDocType } from "@/components/SourceDocPeekModal";
import type { PoLine } from "@/lib/purchase/po-detail";
import type { ItemRow, MailOutcome } from "./types";

export function useOrderDetail(id: string) {
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
  const { data: locationsData } = useLocations();

  const projectOptions = (projectsData?.data ?? []).map((p) => ({ value: p.id, label: p.name }));
  const locationOptions = (locationsData?.data ?? []).filter((l) => l?.status === "active").map((l) => ({ value: l.id, label: l.name }));

  // Today's date in yyyy-MM-dd format for the GRN date default.
  const todayStr = new Date().toISOString().slice(0, 10);

  // Pre-populated line items derived from the PO. One row per PO
  // line; reference columns (Material, UOM, PO Qty, Prev. Rcvd,
  // Pending) are filled in so the user only types Received /
  // Rejected / Batch / Condition.
  const grnInitialLines = (po?.lines ?? []).map((l: PoLine) => {
    const poQty = parseFloat(String(l.poQty ?? l.quantity ?? "0")) || 0;
    const prevRcvd = parseFloat(String(l.receivedQty ?? "0")) || 0;
    return {
      itemId: l.itemId,
      itemName: l.itemName || "",
      uomCode: l.uomCode || "",
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
  return {
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
  };
}
