import type { ApprovalInfo } from "@/lib/approvals/approval-info";

/** Enriched good-return detail as returned by `GET /api/store/good-returns/[id]`. */
export interface ReturnLine {
  id?: string;
  itemId?: string | null;
  itemName?: string | null;
  itemCode?: string | null;
  uomCode?: string | null;
  returnQty?: number | string | null;
  quantity?: number | string | null;
  unitRate?: number | string | null;
  rate?: number | string | null;
  batchNo?: string | null;
  remarks?: string | null;
}

export interface GoodReturnDetail {
  status?: string | null;
  projectId?: string | null;
  approval?: ApprovalInfo | null;
  returnNumber?: string | null;
  projectName?: string | null;
  vendorName?: string | null;
  reason?: string | null;
  locationName?: string | null;
  returnDate?: string | null;
  grnNumber?: string | null;
  challanNo?: string | null;
  vehicleNo?: string | null;
  driverName?: string | null;
  driverMobileNo?: string | null;
  lineCount?: number | null;
  transactionAmount?: number | null;
  remarks?: string | null;
  ewayBillNo?: string | null;
  intercityTransfer?: boolean | null;
  rejectionReason?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  updatedByName?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  dispatchedAt?: string | null;
  lines?: ReturnLine[];
}
