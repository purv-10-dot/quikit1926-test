"use client";

/**
 * Purchase Orders — list + quick create.
 *
 * The "Source RFQ" dropdown lists RFQs in `evaluated` or `closed` state
 * — i.e. the ones where the vendor selection is done and a PO can be
 * raised. Picking an RFQ stamps `sourceRfqId` + `sourceRfqNumber` on
 * the PO, and the POST handler auto-derives `sourceIndentId` from the
 * chosen RFQ so the existing P0 validation (sourceIndentId mandatory,
 * indent must be L3-approved, etc.) still passes.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Send, ListChecks } from "lucide-react";
import {
  PageHeader, PageContainer, StatusChip, TabBar,
} from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { usePurchaseOrders, useSubmitPO } from "@/hooks/use-purchase";
import { useRFQs, useIndents } from "@/hooks/use-approvals";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import { SelectInput } from "@/components/FormDrawer";
import dynamic from "next/dynamic";
import type { SourceDocType } from "@/components/SourceDocPeekModal";
import type { ItemPickerItem } from "@/components/ItemPickerModal";
const SourceDocPeekModal = dynamic(
  () => import("@/components/SourceDocPeekModal").then((m) => m.SourceDocPeekModal),
  { ssr: false },
);
const ItemPickerModal = dynamic(
  () => import("@/components/ItemPickerModal").then((m) => m.ItemPickerModal),
  { ssr: false },
);
import { useProjects, useVendors, useItems, useLocations, useTermsConditions } from "@/hooks/use-masters";
import { useQueryClient } from "@tanstack/react-query";
import { buildTabCounts, filterByTab, type TabSpec } from "@/lib/tab-counts";

const STATUS_TABS: TabSpec[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "partially_received", label: "Partial" },
  { key: "fully_received", label: "Received" },
  { key: "closed", label: "Closed" },
];

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [peekTarget, setPeekTarget] = useState<{ type: SourceDocType; id: string } | null>(null);
  // Item-picker modal state for the PO Vendor section's "Assign
  // items" button — same ergonomics as the RFQ drawer.
  const [pickerCtx, setPickerCtx] = useState<{
    items: ItemPickerItem[];
    selectedIds: string[];
    onSave: (ids: string[]) => void;
    vendorLabel: string;
  } | null>(null);

  const { data: result } = usePurchaseOrders({ status: "all", search: "" });
  const submitMutation = useSubmitPO();
  const allRows = result?.data ?? [];
  const tabs = useMemo(() => buildTabCounts(allRows, STATUS_TABS), [allRows]);
  const data = useMemo(
    () => filterByTab(allRows, activeTab, STATUS_TABS),
    [allRows, activeTab],
  );

  const handleSubmit = async (id: string) => {
    if (!confirm("Submit this PO for approval?")) return;
    try {
      await submitMutation.mutateAsync(id);
    } catch (err: any) {
      alert(err?.message ?? "Failed to submit");
    }
  };

  const { data: projectsData } = useProjects();
  const { data: vendorsData } = useVendors();
  const { data: itemsData } = useItems();
  const { data: locationsData } = useLocations();
  // T&C templates — show EVERY active template regardless of
  // `applicableTo`. The original filter (po + general only) hid
  // templates the user had tagged as "rfq", which surprised users
  // who keep one or two generic templates and reuse them across
  // document types. PO-tagged ones float to the top of the sort
  // so they're still the obvious default.
  const { data: termsData } = useTermsConditions();
  const termsOptions = useMemo(() => {
    const rows: any[] = termsData?.data ?? [];
    const applicableWeight: Record<string, number> = {
      po: 0,
      general: 1,
      rfq: 2,
      wo: 3,
    };
    return rows
      .filter((r) => r.status === "active")
      .sort(
        (a, b) =>
          (applicableWeight[a.applicableTo] ?? 9) -
          (applicableWeight[b.applicableTo] ?? 9),
      )
      .map((r) => ({
        value: r.id,
        label:
          r.applicableTo && r.applicableTo !== "po"
            ? `${r.title} (${String(r.applicableTo).toUpperCase()})`
            : r.title,
      }));
  }, [termsData]);
  const defaultPoTermsId = useMemo(() => {
    const rows: any[] = termsData?.data ?? [];
    // Prefer a PO-tagged default, then any general default, then any
    // default of another type so a single reusable template still
    // auto-selects on drawer open.
    return (
      rows.find(
        (r) => r.status === "active" && r.applicableTo === "po" && r.isDefault,
      )?.id ??
      rows.find(
        (r) =>
          r.status === "active" &&
          r.applicableTo === "general" &&
          r.isDefault,
      )?.id ??
      rows.find((r) => r.status === "active" && r.isDefault)?.id ??
      ""
    );
  }, [termsData]);
  const termsById = useMemo(() => {
    const rows: any[] = termsData?.data ?? [];
    const m = new Map<string, { title: string; body: string }>();
    for (const r of rows) {
      if (r?.id) m.set(r.id, { title: r.title ?? "", body: r.body ?? "" });
    }
    return m;
  }, [termsData]);

  // Pull all RFQs and keep only those ready for PO creation. The
  // canonical "ready for PO" set is anything past initial draft /
  // pending — approved or further down the lifecycle. The buyer can
  // raise a PO straight off an `approved` RFQ even before it has been
  // formally sent, since approval is the gate that authorises spend.
  const { data: rfqsResult } = useRFQs({ status: "all", search: "" });
  const readyRfqs = useMemo(
    () =>
      (rfqsResult?.data ?? []).filter((r: any) =>
        [
          "approved",
          "sent",
          "responses_received",
          "quoted",
          "evaluated",
          "closed",
        ].includes(r.status),
      ),
    [rfqsResult],
  );

  // Approved indents — populate the Source Indent picker so a PO can
  // be raised straight from an indent without an intervening RFQ.
  const { data: indentsResult } = useIndents({ status: "all", search: "" });
  const approvedIndents = useMemo(
    () =>
      (indentsResult?.data ?? []).filter((i: any) =>
        ["approved", "l3_approved", "partially_ordered"].includes(i.status),
      ),
    [indentsResult],
  );

  const projectOptions = (projectsData?.data ?? []).map((p: any) => ({
    value: p.id,
    label: p.name,
  }));
  // Match the RFQ drawer's vendor label format exactly so the picker
  // reads the same in both flows. `||` (not `??`) treats an empty
  // `companyName` as "missing" and falls through to the contact name
  // — matters for vendors created without a registered company.
  const vendorOptions = (vendorsData?.data ?? [])
    .filter((v: any) => !v.isBlacklisted && v.status !== "blacklisted")
    .map((v: any) => ({
      value: v.id,
      label: v.companyName || v.name || v.id,
    }));
  const itemOptions = (itemsData?.data ?? []).map((i: any) => ({
    value: i.id,
    label: i.name,
  }));
  const sourceRfqOptions = useMemo(
    () =>
      readyRfqs.map((rfq: any) => ({
        value: rfq.id,
        label: rfq.rfqNumber,
      })),
    [readyRfqs]
  );
  const sourceIndentOptions = useMemo(
    () =>
      approvedIndents.map((ind: any) => ({
        value: ind.id,
        label: ind.indentNumber,
      })),
    [approvedIndents],
  );
  const locationOptions = (locationsData?.data ?? []).map((l: any) => ({
    value: l.id,
    label: l.name ?? l.code ?? l.id,
  }));
  const todayIso = new Date().toISOString().slice(0, 10);

  // Indexed lookup so the source-doc onChange handlers can pull the
  // matching row in O(1). We key off the FULL indent list (all
  // statuses) — not just `approvedIndents` — so the RFQ autofill
  // can still find the parent indent's `qtyOpen` even when the
  // indent has rolled into `fully_ordered` / `closed` after the RFQ
  // was raised. The picker options still filter to approved only.
  const indentById = useMemo(() => {
    const m = new Map<string, any>();
    for (const i of indentsResult?.data ?? []) m.set(i.id, i);
    return m;
  }, [indentsResult]);
  const rfqById = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of readyRfqs) m.set(r.id, r);
    return m;
  }, [readyRfqs]);
  const allItems = itemsData?.data ?? [];
  // Indexed lookup so the Assign-items picker can pull item-master
  // metadata (name / uom) for each PO line in O(1).
  const itemById = useMemo(() => {
    const m = new Map<string, any>();
    for (const i of allItems) m.set(i.id, i);
    return m;
  }, [allItems]);
  const allVendors = vendorsData?.data ?? [];
  const vendorById = useMemo(() => {
    const m = new Map<string, any>();
    for (const v of allVendors) m.set(v.id, v);
    return m;
  }, [allVendors]);

  // Resolve a line's item by code/name/id so a rename of the items
  // master doesn't break old indents/RFQs we're inheriting from.
  const resolveItemId = (l: any): string => {
    if (!l) return "";
    const match =
      (l.itemCode && allItems.find((it: any) => it.code === l.itemCode)) ||
      (l.itemName && allItems.find((it: any) => it.name === l.itemName)) ||
      (l.itemId && allItems.find((it: any) => it.id === l.itemId)) ||
      null;
    return match?.id ?? l.itemId ?? "";
  };

  // Pull the best vendor + rate the buyer would expect when choosing a
  // source RFQ. If exactly one vendor quoted, pre-fill that vendor; if
  // multiple quoted, leave vendor blank for the buyer to pick (the
  // Compare modal is the right tool for that decision). Per-line
  // rates fall back to the vendor's quote on that line.
  const pickRfqVendorAndRates = (rfq: any): {
    vendorId: string | null;
    rateByLineKey: Map<string, string>;
  } => {
    const vendors: any[] = rfq?.vendors ?? [];
    const quoted = vendors.filter(
      (v) => Array.isArray(v.quotedRates) && v.quotedRates.length > 0,
    );
    const chosen = quoted.length === 1 ? quoted[0] : null;
    const rateByLineKey = new Map<string, string>();
    if (chosen) {
      for (const q of chosen.quotedRates ?? []) {
        if (q?.lineId) rateByLineKey.set(String(q.lineId), String(q.rate ?? ""));
      }
    }
    return { vendorId: chosen?.vendorId ?? null, rateByLineKey };
  };

  const config = {
    title: "New Purchase Order",
    subtitle:
      "Standard POs trace back to an Indent / RFQ. Tick Urgent Local to raise one directly for an emergency site need.",
    apiEndpoint: "/api/purchase/orders",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase-orders"] }),
    fields: [
      {
        // Standard vs Urgent Local toggle. When ticked, the Indent /
        // RFQ source chain is bypassed — both pickers become optional
        // and the server skips P0 SOURCE_INDENT_REQUIRED validation
        // (see purchase-service.validatePOCreation). The buyer must
        // still pick a vendor and add line items manually.
        key: "isUrgentLocal",
        label: "Urgent Local Purchase (skip Indent / RFQ)",
        type: "checkbox" as const,
        span: 2 as const,
        hint: "Use only for emergency site needs where waiting on Indent / RFQ approval isn't possible.",
      },
      {
        // Justification for the urgent override — required when the
        // toggle is on, hidden otherwise. Persisted on the PO record
        // so approvers can see WHY the chain was bypassed.
        key: "urgentLocalReason",
        label: "Reason for Urgent Local PO",
        type: "textarea" as const,
        span: 2 as const,
        placeholder:
          "e.g. Site shutdown — DG set repair parts needed within 4 hours",
        hiddenIf: (fd: Record<string, string>) => fd.isUrgentLocal !== "true",
        requiredIf: (fd: Record<string, string>) => fd.isUrgentLocal === "true",
      },
      {
        key: "poDate",
        label: "PO Date",
        type: "date" as const,
        required: true,
        defaultValue: todayIso,
      },
      {
        // Source picker (Indent). In Standard mode, the buyer must
        // pick EITHER an Indent OR an RFQ (selecting an RFQ auto-
        // derives its parent indent server-side). In Urgent Local
        // mode the toggle bypasses the chain and this field is fully
        // optional — server-side P0 validation also skips the
        // SOURCE_INDENT_REQUIRED check when isUrgentLocal=true.
        //
        // Picking an indent stamps Project + Delivery Date and copies
        // the indent's open lines into the PO grid so the buyer just
        // has to fill rates / GST. Gets locked (disabled) once a
        // Source RFQ is selected — the RFQ implies its own parent
        // indent, so allowing both pickers to be edited creates an
        // opportunity for a mismatched chain.
        key: "sourceIndentId",
        label: "Source Indent Ref",
        type: "select" as const,
        options: sourceIndentOptions,
        placeholder:
          sourceIndentOptions.length === 0
            ? "No approved indents"
            : "Select Indent…",
        requiredIf: (fd: Record<string, string>) =>
          fd.isUrgentLocal !== "true" && !fd.sourceRfqId,
        disabled: (fd: Record<string, string>) => !!fd.sourceRfqId,
        onChange: (value: string) => {
          if (!value) return;
          const indent = indentById.get(value);
          if (!indent) return;
          const fields: Record<string, string> = {};
          if (indent.projectId) fields.projectId = indent.projectId;
          if (indent.requiredDate) fields.deliveryDate = indent.requiredDate;
          const lines: Record<string, any>[] = (indent.lines ?? []).map(
            (l: any) => {
              const itemId = resolveItemId(l);
              const master = itemById.get(itemId);
              const openQty = String(
                l.qtyOpen ?? l.qtyRequested ?? l.quantity ?? "",
              );
              return {
                itemId,
                // Same indent-line traceability as the RFQ path —
                // the server pairs PO → Indent line by `indentLineId`
                // first, which is essential when the same item
                // appears on multiple indent lines.
                indentLineId: l.id ?? l.lineId ?? undefined,
                poQty: openQty,
                // `maxQty` is the "cap" shown under the Qty input
                // (Max: N). Stored as a sibling so the custom cell
                // can read it without reaching back to the source.
                maxQty: openQty,
                uomCode: l.uomCode ?? master?.uomCode ?? "",
                unitRate: String(l.standardRate ?? l.unitRate ?? master?.standardRate ?? ""),
                gstRate: String(l.gstRate ?? master?.gstRate ?? "18"),
              };
            },
          );
          // No longer force-clears Source RFQ — the field is
          // filtered down below so only RFQs belonging to THIS
          // indent are offered, making a mismatch impossible.
          return { fields, lines, secondaryLines: [{}] };
        },
      },
      {
        // Picking an RFQ inherits Project + Delivery Date and copies
        // its lines. If exactly one vendor on the RFQ has quoted, we
        // pre-select that vendor and use their per-line rates as the
        // PO defaults (still editable). Multiple vendors → leave the
        // vendor field blank, the buyer should use Compare to pick.
        //
        // Options are filtered in real-time based on the currently
        // selected Source Indent — when an indent is chosen, only
        // RFQs raised against THAT indent appear in the dropdown.
        // Clear the indent to see all RFQs again.
        key: "sourceRfqId",
        label: "Source RFQ Ref",
        type: "select" as const,
        requiredIf: (fd: Record<string, string>) =>
          fd.isUrgentLocal !== "true" && !fd.sourceIndentId,
        options: (fd: Record<string, string>): Array<{ value: string; label: string }> => {
          const scoped = fd.sourceIndentId
            ? readyRfqs.filter(
                (r: any) => r.sourceIndentId === fd.sourceIndentId,
              )
            : readyRfqs;
          return scoped.map((r: any) => ({
            value: String(r.id),
            label: String(r.rfqNumber ?? ""),
          }));
        },
        placeholder:
          sourceRfqOptions.length === 0
            ? "No RFQs ready for PO yet"
            : "Select RFQ…",
        onChange: (value: string) => {
          if (!value) return;
          const rfq = rfqById.get(value);
          if (!rfq) return;
          const { vendorId, rateByLineKey } = pickRfqVendorAndRates(rfq);
          const fields: Record<string, string> = {};
          if (rfq.projectId) fields.projectId = rfq.projectId;
          if (rfq.dueDate) fields.deliveryDate = rfq.dueDate;
          // Source-indent linkage: keep the chain intact so downstream
          // validation (open-qty checks against the indent) still
          // works when the buyer raises the PO from the RFQ.
          if (rfq.sourceIndentId) fields.sourceIndentId = rfq.sourceIndentId;
          // Auto-fill the Vendor section with the single quoting
          // vendor (or leave blank when ambiguous).
          const secondaryLines: Record<string, any>[] = vendorId
            ? [
                {
                  vendorId,
                  email: vendorById.get(vendorId)?.email ?? "",
                },
              ]
            : [{}];
          // Cap the pre-filled PO qty at the parent indent's open
          // qty — matching by SPECIFIC indent line (sourceIndentLineId)
          // first, then falling back to itemId. The per-line match
          // matters when the indent has more than one line for the
          // same material (e.g. two HSD rows); indexing by itemId
          // alone made the second RFQ row overwrite the first in
          // the lookup and broke the cap.
          const parentIndent = rfq.sourceIndentId
            ? indentById.get(rfq.sourceIndentId)
            : null;
          const openByLineId = new Map<string, number>();
          const openByItemFallback = new Map<string, number>();
          if (parentIndent) {
            for (const il of parentIndent.lines ?? []) {
              const lineId = il.id ?? il.lineId;
              const iid = il.itemId;
              const open = parseFloat(
                String(il.qtyOpen ?? il.qtyRequested ?? il.quantity ?? "0"),
              );
              if (Number.isFinite(open)) {
                if (lineId) openByLineId.set(String(lineId), open);
                // Fallback takes the SMALLEST qtyOpen across
                // same-item lines so the cap is safe when the PO
                // row can't be paired to a specific indent line.
                if (iid) {
                  const existing = openByItemFallback.get(iid);
                  openByItemFallback.set(
                    iid,
                    existing == null ? open : Math.min(existing, open),
                  );
                }
              }
            }
          }
          const lines: Record<string, any>[] = (rfq.lines ?? []).map(
            (l: any, i: number) => {
              const lineKey = String(l.id ?? l.lineId ?? `row-${i}`);
              const quotedRate = rateByLineKey.get(lineKey);
              const itemId = resolveItemId(l);
              const master = itemById.get(itemId);
              const requested =
                parseFloat(String(l.quantity ?? l.qtyRequested ?? "0")) || 0;
              // Prefer a per-indent-line open qty (accurate when the
              // indent has duplicate items), fall back to the
              // smallest same-item qtyOpen (safe overall).
              const srcIndentLineId = l.sourceIndentLineId
                ? String(l.sourceIndentLineId)
                : null;
              const openQty =
                (srcIndentLineId
                  ? openByLineId.get(srcIndentLineId)
                  : undefined) ?? openByItemFallback.get(itemId);
              const effectiveMax =
                openQty != null && openQty > 0
                  ? Math.min(requested || openQty, openQty)
                  : requested;
              const qty = effectiveMax > 0 ? String(effectiveMax) : "";
              return {
                itemId,
                // Carry the indent-line id onto the PO line so the
                // server's validator pairs THIS po line to THIS
                // indent line, not just any line with the same item.
                indentLineId: srcIndentLineId ?? undefined,
                poQty: qty,
                maxQty: qty,
                uomCode: l.uomCode ?? master?.uomCode ?? "",
                unitRate: String(quotedRate ?? l.standardRate ?? master?.standardRate ?? ""),
                gstRate: String(l.gstRate ?? master?.gstRate ?? "18"),
              };
            },
          );
          return { fields, lines, secondaryLines };
        },
      },
      {
        // Project sits after the two Source pickers so the two-column
        // form renders as:
        //   Row 1 — PO Date      | Source Indent Ref
        //   Row 2 — Source RFQ   | Project
        // Indent / RFQ selection stamps projectId automatically via
        // their onChange handlers, so the user rarely touches this
        // field directly — placing it after the source pickers matches
        // the actual data-entry flow.
        key: "projectId",
        label: "Project",
        type: "select" as const,
        required: true,
        options: projectOptions,
        placeholder: "Select project…",
      },
      {
        key: "deliveryDate",
        label: "Delivery Date",
        type: "date" as const,
        required: true,
      },
      {
        key: "paymentTerms",
        label: "Payment Terms",
        type: "text" as const,
        placeholder: "e.g. 30 Days Credit",
      },
      {
        key: "advanceAmount",
        label: "Advance Amount (₹)",
        type: "number" as const,
        placeholder: "0",
      },
      {
        // Extra header-level charges that land in the totals footer
        // (Other Charges line on the printed PO). Different from
        // `freightCharges` — that's transport only; this covers
        // anything else billed on the invoice (packing, loading…).
        key: "otherCharges",
        label: "Other Charges (₹)",
        type: "number" as const,
        placeholder: "0",
      },
      {
        // Free-text subject rendered on the printed PO as
        // "Supply For: <text>". Mirrors the RFQ's Subject field so
        // the outgoing PDF reads like the RFQ the vendor already
        // quoted against.
        key: "purpose",
        label: "Subject / Supply For",
        type: "text" as const,
        span: 2 as const,
        placeholder: "e.g. MAHINDRA JCB PARTS, Q2 cement supply",
      },
      {
        // Delivery address — where the material should be shipped.
        // NOT the vendor's address; this is the buyer's delivery
        // site (often the project's gate / warehouse). Required,
        // multi-line so full postal detail fits, and rendered
        // prominently on the outgoing PO PDF.
        key: "deliveryAddress",
        label: "Delivery Address",
        type: "textarea" as const,
        span: 2 as const,
        required: true,
        placeholder:
          "Full shipping address — project site / warehouse, street, city, state, pincode",
        hint: "Appears on the PO PDF as the buyer's delivery location.",
      },
      {
        // Picks from the T&C master (Masters → Terms & Conditions).
        // Renders the selected template's body inline below the
        // dropdown so the raiser can verify the clauses before save
        // without leaving the drawer. Required — every PO must ship
        // with an explicit commercial terms reference.
        key: "termsTemplateId",
        label: "Terms & Conditions",
        type: "select" as const,
        span: 2 as const,
        required: true,
        options: termsOptions,
        placeholder:
          termsOptions.length === 0
            ? "No templates — add one under Masters → T&C"
            : "Pick a template…",
        defaultValue: defaultPoTermsId,
        afterNode: (value: string) => {
          const body = value ? termsById.get(value)?.body ?? "" : "";
          if (!body.trim()) return null;
          return (
            <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-snug text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-40 overflow-auto font-sans">
              {body}
            </pre>
          );
        },
      },
    ],
    // Multi-vendor section — same layout as the RFQ "Vendors to
    // Send RFQ" card. When more than one vendor is added, the
    // server splits the submission into one PO per vendor based on
    // each row's `assignedItemIds` (items left unassigned go to all
    // vendors that haven't picked specific lines). Empty selection
    // on a row = "include all PO items".
    secondaryLineItems: {
      label: "Vendors",
      key: "vendors",
      addLabel: "Add Vendor",
      fields: [
        {
          key: "vendorId",
          label: "Vendor",
          type: "select" as const,
          options: vendorOptions,
          placeholder: "Select vendor…",
          width: "wide" as const,
          // Same auto-fill ergonomics as the RFQ vendor row —
          // pull email off the master so a typo can't drift the
          // outgoing PO copy.
          onChange: (value: string) => {
            if (!value) return;
            const v = vendorById.get(value);
            if (!v?.email) return;
            return { email: String(v.email) };
          },
        },
        {
          key: "email",
          label: "Email",
          type: "text" as const,
          placeholder: "Email address",
          width: "wide" as const,
        },
        {
          // "Assign items" — mirrors the RFQ vendor row exactly.
          // Pulls options from the primary PO Items grid (so items
          // the user hasn't added yet are never offered). Empty
          // selection = "include all items" (same default as RFQ).
          // Row-index keys (`row-N`) are used so two lines that
          // reference the same material can be toggled independently.
          key: "assignedItemIds",
          label: "Items",
          type: "custom" as const,
          width: "wide" as const,
          render: (
            line: Record<string, any>,
            update: (patch: Record<string, any>) => void,
            { primaryLines }: { primaryLines: Record<string, any>[] },
          ) => {
            const selected: string[] = Array.isArray(line.assignedItemIds)
              ? line.assignedItemIds
              : [];
            const pickerItems: ItemPickerItem[] = primaryLines
              .map((pl: any, idx: number) => {
                if (!pl.itemId) return null;
                const master = itemById.get(pl.itemId);
                return {
                  id: `row-${idx}`,
                  label: master?.name ?? pl.itemId,
                  sublabel: [
                    pl.poQty ? `Qty ${pl.poQty}` : null,
                    pl.uomCode ?? null,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                } as ItemPickerItem;
              })
              .filter((x: ItemPickerItem | null): x is ItemPickerItem => x !== null);

            const validIds = new Set(pickerItems.map((p) => p.id));
            const cleanSelected = selected.filter((id) => validIds.has(id));
            const countLabel =
              pickerItems.length === 0
                ? "Add materials first"
                : cleanSelected.length === 0
                  ? `Include all ${pickerItems.length}`
                  : `${cleanSelected.length} of ${pickerItems.length}`;
            const vendor = line.vendorId
              ? vendorById.get(line.vendorId)
              : null;
            const vendorLabel =
              vendor?.companyName || vendor?.name || "vendor";

            return (
              <button
                type="button"
                disabled={pickerItems.length === 0}
                onClick={() =>
                  setPickerCtx({
                    items: pickerItems,
                    selectedIds: cleanSelected,
                    vendorLabel,
                    onSave: (ids) => {
                      update({ assignedItemIds: ids });
                      setPickerCtx(null);
                    },
                  })
                }
                className={`w-full inline-flex items-center justify-between gap-2 px-2 py-1.5 rounded border text-xs ${
                  pickerItems.length === 0
                    ? "border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed"
                    : "border-gray-300 hover:border-orange-400 hover:bg-orange-50 text-gray-700"
                }`}
              >
                <span className="inline-flex items-center gap-1.5 truncate">
                  <ListChecks className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Assign items</span>
                </span>
                <span className="text-[11px] font-semibold text-gray-500 shrink-0">
                  {countLabel}
                </span>
              </button>
            );
          },
        },
      ],
    },
    // Buyer-side contact persons for the outgoing PO / email.
    // Same pattern as the RFQ contact list — multiple rows allowed.
    // Each row has Name + Mobile; the API joins these into comma-
    // separated `contactPerson` / `contactMobile` strings.
    tertiaryLineItems: {
      label: "Contact Persons",
      key: "contacts",
      addLabel: "Add Contact",
      fields: [
        {
          key: "name",
          label: "Contact Person",
          type: "text" as const,
          placeholder: "e.g. Anand Sharma",
          width: "wide" as const,
        },
        {
          key: "mobile",
          label: "Mobile",
          type: "text" as const,
          placeholder: "10-digit mobile",
          width: "wide" as const,
        },
      ],
    },
    lineItems: {
      label: "PO Items",
      // Client-side pre-submit guard — returns a user-facing error
      // when any PO line's qty exceeds the Max it was capped to on
      // autofill. Mirrors the server's `INDENT_QTY_EXCEEDED` rule
      // so the user sees the failure inline instead of round-
      // tripping to the API and getting a 400.
      validateBeforeSubmit: (rows: Record<string, any>[]) => {
        const offending: string[] = [];
        rows.forEach((r, idx) => {
          const qty = parseFloat(String(r.poQty ?? "0")) || 0;
          const max = parseFloat(String(r.maxQty ?? "0")) || 0;
          if (max > 0 && qty > max) {
            const mat =
              itemById.get(r.itemId)?.name ?? r.itemId ?? `Line ${idx + 1}`;
            offending.push(`"${mat}" — qty ${qty} exceeds max ${max}`);
          }
        });
        if (offending.length === 0) return null;
        return `Please reduce the following line${offending.length > 1 ? "s" : ""} to their Max: ${offending.join("; ")}.`;
      },
      // Card-style rows — the per-line layout is produced by
      // `rowRender` below. `fields` is kept so the payload
      // serialisation in the drawer still picks up the line keys,
      // but the default inline grid is bypassed.
      rowRender: (
        line: Record<string, any>,
        update: (patch: Record<string, any>) => void,
      ) => {
        const qty = parseFloat(String(line.poQty ?? "0")) || 0;
        const rate = parseFloat(String(line.unitRate ?? "0")) || 0;
        const discPct = parseFloat(String(line.discount ?? "0")) || 0;
        const gst = parseFloat(String(line.gstRate ?? "0")) || 0;
        const grossAmount = qty * rate;
        const discAmount = (grossAmount * discPct) / 100;
        const amount = grossAmount - discAmount; // net of discount, pre-GST
        const net = amount + (amount * gst) / 100;
        const RUPEE = "\u20B9";
        const fmt = (n: number) =>
          n > 0
            ? `${RUPEE}${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
            : `${RUPEE}0`;
        const maxQtyNum = line.maxQty ? parseFloat(String(line.maxQty)) : NaN;

        return (
          <div className="space-y-3">
            {/* Row 1 — Material (wide) + Delivery Location */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Material <span className="text-red-500">*</span>
                </label>
                <div className="mt-1">
                  <SelectInput
                    value={line.itemId ?? ""}
                    onChange={(v) => {
                      const item = v ? itemById.get(v) : null;
                      const patch: Record<string, any> = { itemId: v };
                      if (item) {
                        if (item.uomCode) patch.uomCode = String(item.uomCode);
                        if (item.gstRate != null)
                          patch.gstRate = String(item.gstRate);
                        if (item.standardRate != null)
                          patch.unitRate = String(item.standardRate);
                      }
                      update(patch);
                    }}
                    placeholder="Select material…"
                    options={itemOptions}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Delivery Location
                </label>
                <div className="mt-1">
                  <SelectInput
                    value={line.deliveryLocationId ?? ""}
                    onChange={(v) => update({ deliveryLocationId: v })}
                    placeholder="Location…"
                    options={locationOptions}
                  />
                </div>
              </div>
            </div>

            {/* Row 2 — Qty / UOM / Rate / Disc% / Amount / GST / Net.
                Fractional columns instead of `grid-cols-7` because
                currency cells (Amount, Net) need more space than
                UOM / Disc% / GST, otherwise values overflow.  */}
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns:
                  "1.2fr 0.8fr 1fr 0.8fr 1.4fr 0.8fr 1.4fr",
              }}
            >
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Quantity <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max={
                    !Number.isNaN(maxQtyNum) && maxQtyNum > 0
                      ? maxQtyNum
                      : undefined
                  }
                  value={line.poQty ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    // Hard-clamp to `maxQty` when the row was seeded
                    // from an indent/RFQ — exceeding that triggers
                    // `INDENT_QTY_EXCEEDED` on the server. Clamping
                    // on input is friendlier than the user typing a
                    // value that's then rejected at Submit.
                    if (!Number.isNaN(maxQtyNum) && maxQtyNum > 0) {
                      const n = parseFloat(raw);
                      if (Number.isFinite(n) && n > maxQtyNum) {
                        update({ poQty: String(maxQtyNum) });
                        return;
                      }
                    }
                    update({ poQty: raw });
                  }}
                  placeholder="0"
                  className={`mt-1 w-full px-3 py-2 rounded-lg border text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                    !Number.isNaN(maxQtyNum) &&
                    maxQtyNum > 0 &&
                    parseFloat(String(line.poQty ?? "0")) > maxQtyNum
                      ? "border-red-400 bg-red-50"
                      : "border-gray-300"
                  }`}
                />
                {!Number.isNaN(maxQtyNum) && maxQtyNum > 0 && (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Max: {maxQtyNum.toLocaleString("en-IN")}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  UOM
                </label>
                <div className="mt-1 h-[38px] px-3 flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm font-medium uppercase text-gray-700">
                  {line.uomCode || "—"}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Rate ({RUPEE})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unitRate ?? ""}
                  onChange={(e) => update({ unitRate: e.target.value })}
                  placeholder="0.00"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Disc %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={line.discount ?? ""}
                  onChange={(e) => update({ discount: e.target.value })}
                  placeholder="0"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Amount ({RUPEE})
                </label>
                <div className="mt-1 h-[38px] px-2 flex items-center justify-end rounded-lg border border-gray-200 bg-gray-50 text-[13px] font-semibold tabular-nums text-gray-800 whitespace-nowrap overflow-hidden">
                  {fmt(amount)}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  GST %
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.gstRate ?? ""}
                  onChange={(e) => update({ gstRate: e.target.value })}
                  placeholder="18"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Net ({RUPEE})
                </label>
                <div className="mt-1 h-[38px] px-2 flex items-center justify-end rounded-lg border border-indigo-200 bg-white text-[13px] font-bold tabular-nums text-indigo-700 whitespace-nowrap overflow-hidden">
                  {fmt(net)}
                </div>
              </div>
            </div>

            {/* Row 3 — Specification / Grade */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Specification / Grade
              </label>
              <input
                type="text"
                value={line.specification ?? ""}
                onChange={(e) => update({ specification: e.target.value })}
                placeholder="Grade, brand, size…"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
        );
      },
      fields: [
        {
          // Material picker — when the user picks an item, snapshot
          // the master's `uomCode` and `gstRate` onto the row so the
          // read-only UOM cell and the default GST% have a sensible
          // starting value without the user typing them.
          key: "itemId",
          label: "Material",
          type: "select" as const,
          options: itemOptions,
          placeholder: "Select material",
          width: "wide" as const,
          onChange: (value: string) => {
            if (!value) return;
            const item = itemById.get(value);
            if (!item) return;
            const patch: Record<string, any> = {};
            if (item.uomCode) patch.uomCode = String(item.uomCode);
            if (item.gstRate != null && !Number.isNaN(parseFloat(item.gstRate)))
              patch.gstRate = String(item.gstRate);
            if (item.standardRate != null) patch.unitRate = String(item.standardRate);
            return patch;
          },
        },
        {
          key: "deliveryLocationId",
          label: "Delivery Location",
          type: "select" as const,
          options: locationOptions,
          placeholder: "Location…",
        },
        {
          key: "uomCode",
          label: "UOM",
          type: "custom" as const,
          render: (line: Record<string, any>) => (
            <div className="h-[28px] flex items-center justify-center text-[11px] font-medium uppercase text-gray-600 bg-white border border-gray-200 rounded">
              {line.uomCode || "—"}
            </div>
          ),
        },
        {
          // Quantity input with the "Max: N" hint that appears when
          // the row was seeded from a source indent/RFQ carrying an
          // open qty. Exceeding the max is not blocked here — the
          // server enforces `poQty <= qtyOpen` via P0 validation.
          key: "poQty",
          label: "Qty",
          type: "custom" as const,
          render: (
            line: Record<string, any>,
            update: (patch: Record<string, any>) => void,
          ) => {
            const max = line.maxQty ? parseFloat(String(line.maxQty)) : NaN;
            return (
              <div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.poQty ?? ""}
                  onChange={(e) => update({ poQty: e.target.value })}
                  placeholder="0"
                  className="w-full px-2 py-1.5 rounded border border-gray-300 text-xs text-center"
                />
                {!Number.isNaN(max) && max > 0 && (
                  <p className="text-[9px] text-gray-400 mt-0.5 text-center">
                    Max: {max.toLocaleString("en-IN")}
                  </p>
                )}
              </div>
            );
          },
        },
        {
          key: "unitRate",
          label: "Rate (₹)",
          type: "number" as const,
          placeholder: "0.00",
        },
        {
          // Amount = Qty × Rate. Read-only computed cell.
          key: "_amount",
          label: "Amount (₹)",
          type: "custom" as const,
          render: (line: Record<string, any>) => {
            const qty = parseFloat(String(line.poQty ?? "0")) || 0;
            const rate = parseFloat(String(line.unitRate ?? "0")) || 0;
            const amount = qty * rate;
            return (
              <div className="h-[28px] flex items-center justify-end px-2 text-xs tabular-nums text-gray-700">
                {amount > 0 ? amount.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "0"}
              </div>
            );
          },
        },
        {
          key: "gstRate",
          label: "GST %",
          type: "number" as const,
          placeholder: "18",
        },
        {
          // Net = Amount + GST. Read-only computed cell.
          key: "_net",
          label: "Net (₹)",
          type: "custom" as const,
          render: (line: Record<string, any>) => {
            const qty = parseFloat(String(line.poQty ?? "0")) || 0;
            const rate = parseFloat(String(line.unitRate ?? "0")) || 0;
            const gst = parseFloat(String(line.gstRate ?? "0")) || 0;
            const amount = qty * rate;
            const net = amount + (amount * gst) / 100;
            return (
              <div className="h-[28px] flex items-center justify-end px-2 text-xs tabular-nums font-semibold text-gray-800">
                {net > 0 ? net.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "0"}
              </div>
            );
          },
        },
      ],
      // Totals footer — computes Subtotal / Tax / Net, and wires
      // Freight Charges + Discount inputs directly into formData so
      // the POST handler can read `body.freightCharges` / `discount`
      // without extra plumbing.
      footer: (ctx: {
        lines: Record<string, any>[];
        formData: Record<string, string>;
        setFormData: (patch: Record<string, string>) => void;
      }) => {
        // Line-level aggregates: gross = qty*rate (pre-discount),
        // subtotal = gross − per-line discount (the number the
        // printed PO calls "NET" in its breakdown), tax applies to
        // the discounted subtotal.
        let grossAmount = 0;
        let lineDiscountTotal = 0;
        let subtotal = 0;
        let totalTax = 0;
        let filledLines = 0;
        for (const l of ctx.lines) {
          const qty = parseFloat(String(l.poQty ?? "0")) || 0;
          const rate = parseFloat(String(l.unitRate ?? "0")) || 0;
          const discPct = parseFloat(String(l.discount ?? "0")) || 0;
          const gst = parseFloat(String(l.gstRate ?? "0")) || 0;
          const gross = qty * rate;
          const lineDisc = (gross * discPct) / 100;
          const afterDisc = gross - lineDisc;
          grossAmount += gross;
          lineDiscountTotal += lineDisc;
          subtotal += afterDisc;
          totalTax += (afterDisc * gst) / 100;
          if (l.itemId) filledLines += 1;
        }
        const freight = parseFloat(ctx.formData.freightCharges ?? "0") || 0;
        const other = parseFloat(ctx.formData.otherCharges ?? "0") || 0;
        const headerDiscount = parseFloat(ctx.formData.discount ?? "0") || 0;
        const grand =
          subtotal + totalTax + freight + other - headerDiscount;
        // Expressing the rupee symbol via a JS string concat avoids the
        // JSX text-mode gotcha where `\u20B9` inside a JSX expression
        // renders as the literal backslash-u sequence.
        const RUPEE = "\u20B9";
        const fmt = (n: number) =>
          `${RUPEE}${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
        return (
          <div className="mt-4 space-y-3">
            {/* Compact summary row — Subtotal / Tax / Freight / Discount
                sit in one bordered card so they read as computed
                inputs rather than a finance ledger. */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-gray-200">
                <div className="px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Amount
                  </p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-900">
                    {fmt(grossAmount)}
                  </p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Line Disc.
                  </p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-900">
                    {fmt(lineDiscountTotal)}
                  </p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Net
                  </p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-900">
                    {fmt(subtotal)}
                  </p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Tax (GST)
                  </p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-900">
                    {fmt(totalTax)}
                  </p>
                </div>
                <label className="px-3 py-2.5 block cursor-text">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Freight ({RUPEE})
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={ctx.formData.freightCharges ?? ""}
                    onChange={(e) =>
                      ctx.setFormData({ freightCharges: e.target.value })
                    }
                    placeholder="0"
                    className="mt-0.5 w-full text-sm font-bold tabular-nums text-gray-900 bg-transparent focus:outline-none"
                  />
                </label>
                <label className="px-3 py-2.5 block cursor-text">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Other ({RUPEE})
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={ctx.formData.otherCharges ?? ""}
                    onChange={(e) =>
                      ctx.setFormData({ otherCharges: e.target.value })
                    }
                    placeholder="0"
                    className="mt-0.5 w-full text-sm font-bold tabular-nums text-gray-900 bg-transparent focus:outline-none"
                  />
                </label>
              </div>
            </div>

            {/* Estimated / Grand Total strip — mirrors the amber
                "Estimated Total" banner from the indent drawer:
                item count on the left, label + big value on the
                right, soft amber background so it reads as a
                summary rather than another computed field. */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-amber-200 bg-amber-50">
              <span className="text-sm text-gray-700">
                {filledLines} {filledLines === 1 ? "item" : "items"}
              </span>
              <div className="text-right">
                <p className="text-[11px] text-gray-500">Grand Total</p>
                <p className="text-xl font-extrabold tabular-nums text-gray-900">
                  {fmt(grand)}
                </p>
              </div>
            </div>
          </div>
        );
      },
    },
  };

  const columns: ColDef<any>[] = [
    {
      // Stacked PO cell — number on top, date underneath, and when
      // the PO chains back to an indent we surface "Ref: <indent>"
      // as a small clickable link that opens the indent peek modal.
      // Mirrors the Indent list's "PO-BKP-27-0002 / Date: … / Ref:
      // IND-…" pattern the user pointed at.
      key: "poNumber", label: "PO Number", sortable: true, searchable: true,
      render: (row) => (
        <div className="flex flex-col leading-tight">
          <span
            className="text-blue-600 cursor-pointer hover:underline font-medium"
            onClick={() => router.push(`/purchase/orders/${row.id}`)}
          >
            {row.poNumber}
            {row.isUrgentLocal && (
              <span className="ml-1 text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded">
                URGENT
              </span>
            )}
          </span>
          {row.poDate && (
            <span className="text-[11px] text-gray-500 mt-0.5">
              Date: {row.poDate}
            </span>
          )}
          {row.sourceIndentNumber && row.sourceIndentId && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPeekTarget({ type: "indent", id: row.sourceIndentId });
              }}
              className="text-[11px] text-indigo-600 hover:text-indigo-800 underline font-mono text-left mt-0.5 w-fit"
              title="View Indent details"
            >
              Ref: {row.sourceIndentNumber}
            </button>
          )}
        </div>
      ),
    },
    {
      key: "sourceRfqNumber",
      label: "Source RFQ",
      sortable: true,
      searchable: true,
      render: (row) =>
        row.sourceRfqNumber && row.sourceRfqId ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPeekTarget({ type: "rfq", id: row.sourceRfqId });
            }}
            className="font-mono text-xs text-indigo-600 hover:text-indigo-800 underline"
            title="View RFQ details"
          >
            {row.sourceRfqNumber}
          </button>
        ) : row.sourceIndentNumber && row.sourceIndentId ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPeekTarget({ type: "indent", id: row.sourceIndentId });
            }}
            className="font-mono text-[11px] text-gray-500 hover:text-indigo-700 underline"
            title="View Indent details"
          >
            via {row.sourceIndentNumber}
          </button>
        ) : (
          <span className="text-[11px] text-gray-400 italic">—</span>
        ),
    },
    { key: "vendorName", label: "Vendor", sortable: true, searchable: true },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "poDate", label: "Date", type: "date", sortable: true },
    {
      key: "deliveryDate",
      label: "Delivery Date",
      type: "date",
      sortable: true,
      render: (row) => {
        const dd = row.deliveryDate ? String(row.deliveryDate).slice(0, 10) : "";
        if (!dd) return <span className="text-gray-400">—</span>;
        // `isOverdue` is computed server-side in po-repository.enrichPO.
        // We render the date plus a compact "Overdue · Nd" pill so the
        // user spots stalled POs from the list without opening each.
        if (row.isOverdue) {
          const ms = Date.now() - new Date(dd).getTime();
          const days = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
          return (
            <div className="flex items-center gap-1.5">
              <span className="text-amber-700">{dd}</span>
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full"
                title={`Delivery overdue by ${days} day${days === 1 ? "" : "s"}`}
              >
                Overdue · {days}d
              </span>
            </div>
          );
        }
        return <span className="text-gray-700">{dd}</span>;
      },
    },
    {
      key: "totalAmount", label: "Amount", type: "number", sortable: true,
      render: (row) => row.totalAmount ? `₹ ${Number(row.totalAmount).toLocaleString("en-IN")}` : "—",
    },
    {
      key: "status", label: "Status", type: "select",
      options: ["draft", "pending_approval", "approved", "partially_received", "fully_received", "closed"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
    {
      key: "_actions", label: "Actions", width: "100px",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => router.push(`/purchase/orders/${row.id}`)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            title="View"
          >
            <Eye className="w-4 h-4" />
          </button>
          {row.status === "draft" && (
            <button
              onClick={() => handleSubmit(row.id)}
              className="p-1.5 rounded hover:bg-gray-100 text-orange-500"
              title="Submit for Approval"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle="Order materials from vendors against approved RFQs and Indents"
        breadcrumbs={[{ label: "Purchase", href: "/purchase" }, { label: "Purchase Orders" }]}
      />

      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <PageContainer>
        <DataTable
          id="purchase-orders"
          columns={columns}
          data={data}
          onAdd={() => setDrawerOpen(true)}
          addLabel="New PO"
          defaultSort="poDate"
          defaultSortDir="desc"
        />
      </PageContainer>

      <QuickCreateDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        config={config}
      />

      <SourceDocPeekModal
        open={!!peekTarget}
        initial={peekTarget}
        onClose={() => setPeekTarget(null)}
      />

      <ItemPickerModal
        open={!!pickerCtx}
        title="Assign items to vendor"
        subtitle={
          pickerCtx
            ? `Pick which PO items to include for ${pickerCtx.vendorLabel}. Leave empty to include all.`
            : undefined
        }
        items={pickerCtx?.items ?? []}
        selectedIds={pickerCtx?.selectedIds ?? []}
        onClose={() => setPickerCtx(null)}
        onSave={(ids) => pickerCtx?.onSave(ids)}
      />
    </>
  );
}
