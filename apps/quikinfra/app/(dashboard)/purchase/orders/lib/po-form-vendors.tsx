"use client";

import { ListChecks } from "lucide-react";
import { WhitebooksVendorSelect } from "@/components/WhitebooksVendorSelect";
import { VendorTermsCell } from "@/components/VendorTermsCell";
import type { QuickCreateConfig } from "@/components/QuickCreateDrawer";
import type { ItemPickerItem } from "@/components/ItemPickerModal";
import type { PoFormConfigDeps } from "./po-form-deps";

export function buildVendorsSection(deps: PoFormConfigDeps): QuickCreateConfig["secondaryLineItems"] {
  const { vendorOptions, vendorById, setPickerCtx, termsById, defaultPoTermsId } = deps;
  return {
      label: "Vendors",
      key: "vendors",
      addLabel: "Add Vendor",
      // Every vendor must have at least one item assigned — an empty
      // selection is no longer allowed to mean "include all". Only
      // rows with a chosen vendor are checked (the trailing blank row
      // is ignored).
      validateBeforeSubmit: (vendors) => {
        const withVendor = vendors.filter((v) => v.vendorId);
        const missing = withVendor.some(
          (v) =>
            !Array.isArray(v.assignedItemIds) ||
            v.assignedItemIds.length === 0,
        );
        if (!missing) return null;
        return "Please select the item material for the vendor — each vendor must have at least one item assigned.";
      },
      fields: [
        {
          key: "vendorId",
          label: "Vendor",
          type: "custom" as const,
          width: "wide" as const,
          render: (
            line,
            update: (patch: Record<string, unknown>) => void,
          ) => (
            <WhitebooksVendorSelect
              line={line}
              update={update}
              vendorOptions={vendorOptions}
              vendorById={vendorById}
            />
          ),
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
            line,
            update: (patch: Record<string, unknown>) => void,
            { primaryLines },
          ) => {
            const selected: string[] = Array.isArray(line.assignedItemIds)
              ? line.assignedItemIds
              : [];
            const pickerItems: ItemPickerItem[] = primaryLines
              .map((pl, idx: number) => {
                if (!pl.itemId) return null;
                return {
                  id: `row-${idx}`,
                  label: (pl.itemName as string) ?? pl.itemId,
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
                  ? "Select items (required)"
                  : `${cleanSelected.length} of ${pickerItems.length}`;
            const vendor = line.vendorId
              ? vendorById.get(line.vendorId)
              : null;
            const vendorLabel =
              vendor?.name || vendor?.companyName || "vendor";

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
                    : "border-gray-300 hover:border-accent-400 hover:bg-accent-50 text-gray-700"
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
        {
          // Per-vendor T&C override. Opening the editor lets the raiser
          // write vendor-specific clauses (e.g. a different payment term
          // for one supplier) without touching the shared master
          // template or the other vendors in this submission. Each
          // vendor row becomes its own PO, so this override lands on
          // that PO only. Seeds from the org's default T&C template —
          // there's no shared document-level text on the PO itself.
          key: "termsAndConditions",
          label: "Terms",
          type: "custom" as const,
          width: "wide" as const,
          render: (line, update) => {
            const vendor = line.vendorId ? vendorById.get(line.vendorId) : null;
            const vendorLabel = vendor?.name || vendor?.companyName || "this vendor";
            return (
              <VendorTermsCell
                line={line}
                update={update}
                defaultBody={
                  defaultPoTermsId ? termsById.get(defaultPoTermsId)?.body ?? "" : ""
                }
                templates={Array.from(termsById.entries()).map(([id, t]) => ({
                  id,
                  title: t.title,
                  body: t.body,
                }))}
                vendorLabel={vendorLabel}
              />
            );
          },
        },
      ],
  };
}

export function buildContactsSection(): QuickCreateConfig["tertiaryLineItems"] {
  return {
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
          // Digits only, capped at 10 — strips any non-numeric input.
          onChange: (value: string) => ({
            mobile: value.replace(/\D/g, "").slice(0, 10),
          }),
        },
      ],
  };
}
