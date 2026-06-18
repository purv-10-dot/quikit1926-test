import type { ApprovalInfo } from "@/lib/approvals/approval-info";

/** Enriched GRN detail as returned by `GET /api/purchase/grn/[id]`. */
export interface GrnLine {
  id?: string;
  itemId?: string | null;
  itemName?: string | null;
  uomCode?: string | null;
  receivedQty?: number | string | null;
  acceptedQty?: number | string | null;
  rejectedQty?: number | string | null;
  qualityStatus?: string | null;
  batchNo?: string | null;
}

export interface GrnDetail {
  approval?: ApprovalInfo | null;
  status?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  project?: { name?: string | null } | null;
  poId?: string | null;
  poNumber?: string | null;
  po?: { id?: string | null; poNumber?: string | null } | null;
  vendorName?: string | null;
  vendor?: { name?: string | null } | null;
  grnNumber?: string | null;
  grnDate?: string | null;
  challanNo?: string | null;
  challanDate?: string | null;
  challanAttachment?: string | null;
  supplierInvoiceNo?: string | null;
  supplierInvoiceDate?: string | null;
  approxInvoiceValue?: number | string | null;
  ewayBillNo?: string | null;
  vehicleNo?: string | null;
  weighbridgeSlipNo?: string | null;
  overallQualityStatus?: string | null;
  receivedByName?: string | null;
  remarks?: string | null;
  lineCount?: number | null;
  createdAt?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  lines?: GrnLine[];
}
