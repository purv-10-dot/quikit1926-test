import type { ApprovalInfo } from "@/lib/approvals/approval-info";

/** Enriched work-order detail as returned by `GET /api/projects/work-orders/[id]`. */
export interface BoqScopeItem {
  boqNo?: string | null;
  itemCode?: string | null;
  scopeType?: string | null;
  scopeId?: string | null;
  description?: string | null;
  itemName?: string | null;
  uomCode?: string | null;
  uom?: string | null;
  quantity?: number | string | null;
  rate?: number | string | null;
  amount?: number | string | null;
  // Labour-only line fields (present when the work order is "Labour Only")
  lineType?: string | null;
  lineDate?: string | null;
  activityName?: string | null;
  workCategoryId?: string | null;
  labourCounts?: { type: string; count: number }[] | null;
}

export interface WorkOrderDetail {
  status?: string | null;
  approval?: ApprovalInfo | null;
  woNumber?: string | null;
  type?: string | null;
  workType?: string | null;
  title?: string | null;
  projectName?: string | null;
  contractorName?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  progressPct?: number | string | null;
  totalAmount?: number | string | null;
  retentionPct?: number | string | null;
  securityDepositPct?: number | string | null;
  tdsPct?: number | string | null;
  rejectionReason?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  boqItems?: BoqScopeItem[];
}
