import type { ApprovalInfo } from "@/lib/approvals/approval-info";

/** Enriched RFQ detail as returned by `GET /api/purchase/rfqs/[id]`. */
export interface RfqLine {
  id?: string;
  lineId?: string;
  itemId?: string | null;
  itemName?: string | null;
  uomCode?: string | null;
  quantity?: number | string | null;
  qtyRequested?: number | string | null;
  specification?: string | null;
}

export interface RfqVendor {
  id?: string;
  vendorId?: string;
  vendorName?: string | null;
  email?: string | null;
  phone?: string | null;
  assignedItemIds?: string[];
  quotedRates?: Array<{ lineId?: string; rate?: string | number }>;
}

export interface RfqDetail {
  status?: string | null;
  projectId?: string | null;
  approval?: ApprovalInfo | null;
  rfqNumber?: string | null;
  projectName?: string | null;
  rfqDate?: string | null;
  dueDate?: string | null;
  sourceIndentId?: string | null;
  sourceIndentNumber?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  updatedByName?: string | null;
  lines?: RfqLine[];
  vendors?: RfqVendor[];
}
