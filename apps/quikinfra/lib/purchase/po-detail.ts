import type { ApprovalInfo } from "@/lib/approvals/approval-info";

/** Enriched purchase-order detail as returned by `GET /api/purchase/orders/[id]`. */
export interface PoLine {
  id?: string;
  lineId?: string;
  itemId?: string | null;
  itemName?: string | null;
  itemCode?: string | null;
  uomCode?: string | null;
  poQty?: number | string | null;
  quantity?: number | string | null;
  orderedQty?: number | string | null;
  receivedQty?: number | string | null;
  unitRate?: number | string | null;
  rate?: number | string | null;
  discount?: number | string | null;
  gstRate?: number | string | null;
  gstType?: string | null;
  igstAmount?: number | string | null;
  cgstAmount?: number | string | null;
  sgstAmount?: number | string | null;
  lineValueExGST?: number | string | null;
  amount?: number | string | null;
  totalAmount?: number | string | null;
  lineValueIncGST?: number | string | null;
  netAmount?: number | string | null;
}

export interface PoDetail {
  status?: string | null;
  approval?: ApprovalInfo | null;
  projectId?: string | null;
  projectName?: string | null;
  poNumber?: string | null;
  poDate?: string | null;
  deliveryDate?: string | null;
  deliveryLocationId?: string | null;
  isOverdue?: boolean | null;
  lineCount?: number | null;
  paymentTerms?: string | null;
  sourceIndentId?: string | null;
  sourceIndentNumber?: string | null;
  sourceRfqId?: string | null;
  sourceRfqNumber?: string | null;
  vendor?: { name?: string | null } | null;
  vendorName?: string | null;
  vendorAddress?: string | null;
  vendorContactPerson?: string | null;
  vendorEmail?: string | null;
  vendorGSTIN?: string | null;
  vendorPhone?: string | null;
  taxAmount?: number | string | null;
  totalAmount?: number | string | null;
  totalIGST?: number | string | null;
  totalCGST?: number | string | null;
  totalSGST?: number | string | null;
  gstType?: string | null;
  vendorState?: string | null;
  freightCharges?: number | string | null;
  discount?: number | string | null;
  otherCharges?: number | string | null;
  closeReason?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  /** Per-PO T&C snapshot — what the vendor PDF actually carries. */
  termsAndConditions?: string | null;
  lines?: PoLine[];
}
