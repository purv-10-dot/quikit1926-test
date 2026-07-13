import type { ApprovalInfo } from "@/lib/approvals/approval-info";
import type { LineProcurement } from "./procurement-types";

/** Enriched purchase-indent detail as returned by `GET /api/purchase/indents/[id]`. */
export interface IndentLine {
  id?: string;
  lineId?: string;
  itemId?: string | null;
  itemName?: string | null;
  itemCode?: string | null;
  uomCode?: string | null;
  qtyRequested?: number | string | null;
  quantity?: number | string | null;
  qtyOpen?: number | string | null;
  estimatedRate?: number | string | null;
  unitRate?: number | string | null;
  estimatedAmount?: number | string | null;
  amount?: number | string | null;
  preferredVendorName?: string | null;
  /** PO/GRN fulfilment status, attached by the detail route. */
  procurement?: LineProcurement | null;
}

export interface IndentDetail {
  status?: string | null;
  projectId?: string | null;
  approval?: ApprovalInfo | null;
  indentNumber?: string | null;
  indentDate?: string | null;
  projectName?: string | null;
  isUrgent?: boolean | null;
  lineCount?: number | null;
  estimatedTotal?: number | string | null;
  requestedBy?: string | null;
  requestedByName?: string | null;
  requestedByDate?: string | null;
  requiredDate?: string | null;
  sourceMrId?: string | null;
  sourceMrNumber?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  lines?: IndentLine[];
}
