/**
 * Shared GRN field-config builder.
 *
 * Both GRN entry points (`/store/grn` drawer + PO-detail "Create GRN
 * from PO" drawer) consume this to build their `QuickCreateDrawer`
 * field list, so the form stays pixel-identical across both. The
 * caller supplies just the PO-reference field's shape — dropdown for
 * the main GRN page (user picks), disabled text for the PO-detail
 * page (pre-filled) — and gets the full field list back.
 *
 * Keep any field additions/tweaks here so they ship to both drawers
 * at once.
 */

import type { FieldDef } from "@/components/QuickCreateDrawer";

export interface POOption {
  value: string;
  label: string;
}

export interface GrnFieldBuilderArgs {
  /** The "PO Reference" field's configuration — caller supplies
   *  either a select (with options + onChange) for the main GRN list
   *  or a disabled text (with defaultValue) for the PO detail page. */
  poRefField: FieldDef;
  /** Option lists the rest of the fields need. */
  projectOptions: Array<{ value: string; label: string }>;
  locationOptions: Array<{ value: string; label: string }>;
  /** Today's date, yyyy-MM-dd. Defaults to new Date() here but the
   *  caller can pin it for deterministic tests. */
  grnDateDefault?: string;
  /** Seed value for the vendor field — used by the PO-detail drawer
   *  where we already know the vendor at render time. Main GRN page
   *  leaves this undefined and lets the PO onChange populate it. */
  vendorDefault?: string;
  /** Seed value for the Project dropdown. PO-detail prefills from
   *  `po.projectId`; main GRN leaves blank and lets the PO onChange
   *  populate it. */
  projectDefault?: string;
  /** Seed for the invoice value — PO-detail prefills from the PO
   *  total; main GRN page starts blank. */
  invoiceValueDefault?: string;
  /** Seed for the storage location — PO-detail prefills from the PO's
   *  delivery location if present. */
  storageLocationDefault?: string;
}

export function buildGrnFields({
  poRefField,
  projectOptions,
  locationOptions,
  grnDateDefault,
  vendorDefault,
  invoiceValueDefault,
  storageLocationDefault,
  projectDefault,
}: GrnFieldBuilderArgs): FieldDef[] {
  const today =
    grnDateDefault ?? new Date().toISOString().slice(0, 10);
  return [
    poRefField,
    {
      key: "vendorName",
      label: "Vendor",
      type: "text" as const,
      placeholder: "Auto-filled from PO",
      disabled: true,
      defaultValue: vendorDefault ?? "",
    },
    {
      key: "projectId",
      label: "Project",
      type: "select" as const,
      required: true,
      options: projectOptions,
      placeholder: "Select project",
      defaultValue: projectDefault ?? "",
    },
    {
      key: "storageLocationId",
      label: "Storage Location",
      type: "select" as const,
      required: false,
      options: locationOptions,
      placeholder: "Select location",
      defaultValue: storageLocationDefault ?? "",
    },
    {
      key: "grnDate",
      label: "GRN Date",
      type: "date" as const,
      required: true,
      defaultValue: today,
    },
    {
      key: "supplierInvoiceNo",
      label: "Supplier Invoice No",
      type: "text" as const,
      placeholder: "Invoice number",
    },
    {
      key: "supplierInvoiceDate",
      label: "Supplier Invoice Date",
      type: "date" as const,
    },
    {
      key: "challanNo",
      label: "Delivery Challan No.",
      type: "text" as const,
      placeholder: "Challan number",
    },
    {
      key: "challanDate",
      label: "Challan Date",
      type: "date" as const,
    },
    {
      key: "vehicleNo",
      label: "Vehicle No.",
      type: "text" as const,
      placeholder: "Vehicle number",
    },
    {
      key: "receivedBy",
      label: "Received By / Inspector",
      type: "text" as const,
      placeholder: "Search user...",
    },
    {
      key: "overallQualityStatus",
      label: "Overall Quality Status",
      type: "select" as const,
      options: [
        { value: "Accepted", label: "Accepted" },
        { value: "Partially Accepted", label: "Partially Accepted" },
        { value: "Rejected", label: "Rejected" },
        { value: "Pending Inspection", label: "Pending Inspection" },
      ],
      defaultValue: "Accepted",
    },
    {
      key: "weighbridgeSlipNo",
      label: "Weighbridge Slip No.",
      type: "text" as const,
      placeholder: "Weighbridge slip",
    },
    {
      // Optional — filenames are stashed in `challanAttachment` when
      // provided. Actual blob storage endpoint can be wired later.
      key: "challanAttachment",
      label: "Delivery Challan / Photo Attachment",
      type: "file" as const,
      accept: "image/*,application/pdf",
      multiple: true,
    },
    {
      key: "invoiceValue",
      label: "Approx. Invoice Value (\u20B9)",
      type: "number" as const,
      placeholder: "0",
      defaultValue: invoiceValueDefault ?? "",
      hint: "E-Way Bill No becomes mandatory when this is \u20B950,000 or more (exempt for intercity transfers)",
    },
    {
      key: "intercityTransferExempt",
      label: "Intercity Transfer (E-Way Bill Exempt)",
      type: "checkbox" as const,
    },
    {
      key: "ewayBillNo",
      label: "E-Way Bill No.",
      type: "text" as const,
      placeholder: "Enter E-Way Bill No.",
      requiredIf: (form: Record<string, string>) => {
        if (form?.intercityTransferExempt === "true") return false;
        const v = parseFloat(String(form?.invoiceValue ?? "0"));
        return Number.isFinite(v) && v >= 50000;
      },
      validator: (v: string) => {
        const s = String(v ?? "").trim();
        if (!s) return { valid: true };
        if (!/^\d{12}$/.test(s)) {
          return {
            valid: false,
            error: "E-Way Bill No must be 12 digits",
          };
        }
        return { valid: true };
      },
    },
  ];
}
