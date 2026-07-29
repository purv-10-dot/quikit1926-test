import type { ApprovalInfo } from "@/lib/approvals/approval-info";

/** Enriched material-estimation detail as returned by `GET /api/estimations/[id]`. */
export interface EstimationMaterial {
  itemId?: string;
  itemName?: string;
  uomCode?: string;
  qtyPerUnit?: number | string | null;
  wastePercent?: number | string | null;
  totalQty?: number | string | null;
  standardRate?: number | string | null;
  estimatedCost?: number | string | null;
}

export interface EstimationDetail {
  id?: string;
  status?: string | null;
  approval?: ApprovalInfo | null;
  projectName?: string | null;
  /** "ACTIVITY" when this estimation is anchored on a FREE_SCOPE activity. */
  scopeType?: string | null;
  phase?: string | null;
  boqNo?: string | null;
  boqDescription?: string | null;
  boqUnit?: string | null;
  boqQuantity?: number | string | null;
  totalQty?: number | string | null;
  totalCost?: number | string | null;
  materialCount?: number | null;
  rejectionReason?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  updatedByName?: string | null;
  materials?: EstimationMaterial[];
}
