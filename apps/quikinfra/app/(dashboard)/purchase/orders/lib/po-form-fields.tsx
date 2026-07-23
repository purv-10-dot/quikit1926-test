"use client";

import type { QuickCreateConfig } from "@/components/QuickCreateDrawer";
import type { SourceLine, OrderIndentNode, OrderRfqNode, RfqLike } from "./types";
import type { PoFormConfigDeps } from "./po-form-deps";

export function buildMainFields(deps: PoFormConfigDeps): QuickCreateConfig["fields"] {
  const {
    projectOptions, termsOptions, sourceRfqOptions, sourceIndentOptions,
    readyRfqs, vendorById, termsById, indentById, rfqById,
    defaultPoTermsId, todayIso, resolveItemId, pickRfqVendorAndRates,
  } = deps;
  return [
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
          const lines = (indent.lines ?? []).map(
            (l: SourceLine) => {
              const itemId = resolveItemId(l);
              const openQty = String(
                l.qtyOpen ?? l.qtyRequested ?? l.quantity ?? "",
              );
              return {
                itemId,
                // Carry the source line's item name so the lazy picker's
                // trigger shows it without loading the full item master.
                itemName: l.itemName ?? "",
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
                uomCode: l.uomCode ?? "",
                unitRate: String(l.standardRate ?? l.unitRate ?? ""),
                gstRate: String(l.gstRate ?? "18"),
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
                (r) => r.sourceIndentId === fd.sourceIndentId,
              )
            : readyRfqs;
          return scoped.map((r) => ({
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
          const secondaryLines = vendorId
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
          const lines = (rfq.lines ?? []).map(
            (l: SourceLine, i: number) => {
              const lineKey = String(l.id ?? l.lineId ?? `row-${i}`);
              const quotedRate = rateByLineKey.get(lineKey);
              const itemId = resolveItemId(l);
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
                itemName: l.itemName ?? "",
                // Carry the indent-line id onto the PO line so the
                // server's validator pairs THIS po line to THIS
                // indent line, not just any line with the same item.
                indentLineId: srcIndentLineId ?? undefined,
                poQty: qty,
                maxQty: qty,
                uomCode: l.uomCode ?? "",
                unitRate: String(quotedRate ?? l.standardRate ?? ""),
                gstRate: String(l.gstRate ?? "18"),
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
        // Free-text subject rendered on the printed PO under the
        // "Subject :-" bar. Mirrors the RFQ's Subject field so the
        // outgoing PDF reads like the RFQ the vendor already quoted
        // against.
        key: "purpose",
        label: "Subject",
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
  ];
}
