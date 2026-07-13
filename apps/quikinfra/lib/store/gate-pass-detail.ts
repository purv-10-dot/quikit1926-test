import type { ApprovalInfo } from "@/lib/approvals/approval-info";

/** Enriched gate-pass detail as returned by `GET /api/store/gate-passes/[id]`. */
export interface GatePassLine {
  id?: string;
  itemId?: string | null;
  itemName?: string | null;
  materialDescription?: string | null;
  uomCode?: string | null;
  quantity?: number | string | null;
  qty?: number | string | null;
  remarks?: string | null;
}

export interface GatePassDetail {
  status?: string | null;
  projectId?: string | null;
  approval?: ApprovalInfo | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  type?: string | null;
  gatePassNumber?: string | null;
  projectName?: string | null;
  locationName?: string | null;
  gatePassDate?: string | null;
  referenceType?: string | null;
  referenceNo?: string | null;
  challanNo?: string | null;
  expectedReturnDate?: string | null;
  vehicleNo?: string | null;
  driverName?: string | null;
  driverMobileNo?: string | null;
  weighbridgeReading?: number | string | null;
  securityGuard?: string | null;
  materialCondition?: string | null;
  lineCount?: number | null;
  transactionAmount?: number | null;
  purpose?: string | null;
  remarks?: string | null;
  vehiclePhoto?: string | null;
  ewayBillNo?: string | null;
  intercityTransfer?: boolean | null;
  rejectionReason?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  updatedByName?: string | null;
  closedAt?: string | null;
  lines?: GatePassLine[];
}
