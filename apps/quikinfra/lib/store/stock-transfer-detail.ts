import type { ApprovalInfo } from "@/lib/approvals/approval-info";

/** Enriched stock-transfer detail as returned by `GET /api/store/transfers/[id]`. */
export interface TransferLine {
  id?: string;
  itemId?: string | null;
  itemName?: string | null;
  itemCode?: string | null;
  uomCode?: string | null;
  availableStock?: number | string | null;
  dispatchQty?: number | string | null;
  quantity?: number | string | null;
  dispatchCondition?: string | null;
  remarks?: string | null;
}

export interface AssetLine {
  id?: string;
  assetId?: string | null;
  assetName?: string | null;
  assetCode?: string | null;
  category?: string | null;
  uomCode?: string | null;
  dispatchCondition?: string | null;
  remarks?: string | null;
}

export interface StockTransferDetail {
  status?: string | null;
  approval?: ApprovalInfo | null;
  transferNumber?: string | null;
  transferType?: string | null;
  transferReason?: string | null;
  fromLocationName?: string | null;
  toLocationName?: string | null;
  fromCity?: string | null;
  fromState?: string | null;
  toCity?: string | null;
  toState?: string | null;
  sourceProjectId?: string | null;
  sourceProjectName?: string | null;
  destinationProjectName?: string | null;
  transferDate?: string | null;
  vehicleNo?: string | null;
  dispatchDateTime?: string | null;
  estTransitDays?: number | string | null;
  lineCount?: number | null;
  transactionAmount?: number | null;
  interstateTransfer?: boolean | null;
  chargeableTransfer?: boolean | null;
  remarks?: string | null;
  ewayBillNo?: string | null;
  lines?: TransferLine[];
  assetLines?: AssetLine[];
  approvedBy?: string | null;
  approvedByName?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  updatedByName?: string | null;
  dispatchedAt?: string | null;
  receivedAt?: string | null;
  rejectionReason?: string | null;
}
