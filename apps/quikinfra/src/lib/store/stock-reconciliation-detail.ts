import type { ApprovalInfo } from "@/lib/approvals/approval-info";

/** Enriched reconciliation detail as returned by `GET /api/store/reconciliations/[id]`. */
export interface ReconLine {
  id?: string;
  lineNo?: number | string;
  itemId?: string | null;
  itemName?: string | null;
  itemCode?: string | null;
  uomCode?: string | null;
  systemQty?: number | string | null;
  physicalQty?: number | string | null;
  varianceQty?: number | string | null;
  reason?: string | null;
}

export interface ReconciliationDetail {
  status?: string | null;
  approval?: ApprovalInfo | null;
  reconciliationNumber?: string | null;
  projectName?: string | null;
  locationName?: string | null;
  reconciliationDate?: string | null;
  conductedById?: string | null;
  conductedByName?: string | null;
  approvedById?: string | null;
  approvedByName?: string | null;
  lineCount?: number | null;
  createdAt?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  updatedByName?: string | null;
  lines?: ReconLine[];
}
