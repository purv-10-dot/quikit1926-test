import type { ApprovalInfo } from "@/lib/approvals/approval-info";

/** Enriched purchase-requisition detail as returned by `GET /api/purchase/requisitions/[id]`. */
export interface PrLine {
  id?: string;
  lineId?: string;
  itemId?: string | null;
  itemName?: string | null;
  itemCode?: string | null;
  uomCode?: string | null;
  quantity?: number | string | null;
  qtyRequired?: number | string | null;
  qtyRequested?: number | string | null;
  orderedQty?: number | string | null;
  estimatedRate?: number | string | null;
  unitRate?: number | string | null;
  rate?: number | string | null;
  estimatedAmount?: number | string | null;
  amount?: number | string | null;
  totalAmount?: number | string | null;
  stockCheckStatus?: string | null;
  availableStock?: number | string | null;
  currentStock?: number | string | null;
  specification?: string | null;
}

export interface PrDetail {
  status?: string | null;
  projectId?: string | null;
  approval?: ApprovalInfo | null;
  prNumber?: string | null;
  mrNumber?: string | null;
  projectName?: string | null;
  purpose?: string | null;
  requestDate?: string | null;
  requiredDate?: string | null;
  isUrgent?: boolean | null;
  lineCount?: number | null;
  estimatedTotal?: number | string | null;
  createdAt?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  stockCheckSummary?: string | number | null;
  lines?: PrLine[];
}
