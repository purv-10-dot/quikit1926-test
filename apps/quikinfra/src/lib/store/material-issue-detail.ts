import type { ApprovalInfo } from "@/lib/approvals/approval-info";

/** Enriched material-issue detail as returned by `GET /api/store/issues/[id]`. */
export interface IssueLine {
  id?: string;
  itemId?: string | null;
  itemName?: string | null;
  itemCode?: string | null;
  uomCode?: string | null;
  sourceLocationName?: string | null;
  locationName?: string | null;
  reqQty?: number | string | null;
  requestedQty?: number | string | null;
  quantity?: number | string | null;
  issueQty?: number | string | null;
  qty?: number | string | null;
  unitRate?: number | string | null;
  rate?: number | string | null;
  standardRate?: number | string | null;
  availableStock?: number | string | null;
  batchNo?: string | null;
  equipmentNo?: string | null;
  remarks?: string | null;
}

export interface IssueDetail {
  status?: string | null;
  projectId?: string | null;
  approval?: ApprovalInfo | null;
  issueNumber?: string | null;
  projectName?: string | null;
  issueType?: string | null;
  issueDate?: string | null;
  teamDepartment?: string | null;
  contractorName?: string | null;
  issuedToName?: string | null;
  contractorId?: string | null;
  prReference?: string | null;
  woReference?: string | null;
  vehicleNo?: string | null;
  gatePassNo?: string | null;
  issuedBy?: string | null;
  receivedBy?: string | null;
  lineCount?: number | null;
  transactionAmount?: number | null;
  purpose?: string | null;
  remarks?: string | null;
  photoAttachment?: string | null;
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
  rejectedBy?: string | null;
  rejectedByName?: string | null;
  createdByApproval?: boolean | null;
  lines?: IssueLine[];
}
