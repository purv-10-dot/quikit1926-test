import type { ApprovalInfo } from "@/lib/approvals/approval-info";

/** Enriched DPR detail as returned by `GET /api/projects/dpr/[id]`. */
export interface WorkItemRow {
  boqNo?: string | null;
  boqItemId?: string | null;
  description?: string | null;
  todayQty?: number | string | null;
  cumulativeQty?: number | string | null;
  remarks?: string | null;
}

export interface MaterialRow {
  itemId?: string | null;
  uomId?: string | null;
  consumedQty?: number | string | null;
  remarks?: string | null;
}

export interface ManpowerRow {
  contractorId?: string | null;
  category?: string | null;
  skillType?: string | null;
  count?: number | null;
  hoursWorked?: number | string | null;
  workingArea?: string | null;
  messan?: number | string | null;
  maleHelper?: number | string | null;
  femaleHelper?: number | string | null;
  carpenter?: number | string | null;
  fitter?: number | string | null;
  painter?: number | string | null;
  plumber?: number | string | null;
  electrician?: number | string | null;
  operator?: number | string | null;
}

export interface StaffRow {
  name?: string | null;
  designation?: string | null;
  present?: boolean | null;
  reason?: string | null;
}

export interface MachineryRow {
  description?: string | null;
  condition?: string | null;
  requiredQty?: number | null;
  actualQty?: number | null;
  remarks?: string | null;
}

export interface DprDetail {
  status?: string | null;
  approval?: ApprovalInfo | null;
  dprNumber?: string | null;
  reportDate?: string | null;
  projectName?: string | null;
  weatherCondition?: string | null;
  weatherDetail?: string | null;
  siteRemarks?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  updatedAt?: string | null;
  workItems?: WorkItemRow[];
  materials?: MaterialRow[];
  manpower?: ManpowerRow[];
  staff?: StaffRow[];
  machinery?: MachineryRow[];
}
