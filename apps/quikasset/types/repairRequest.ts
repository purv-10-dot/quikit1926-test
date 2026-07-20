/**
 * Hand-written DTO for the employee Repair Request feature.
 *
 * Mirrors the `AstRepairRequest` Prisma model but is deliberately NOT generated
 * from it — it lets the UI + mocks compile independently of the client. Keep the
 * string-literal unions in step with the `AstRepairRequestStatus` /
 * `AstRepairRequestUrgency` enums.
 */

export type RepairRequestUrgency = "Low" | "Medium" | "High" | "Urgent";

export type RepairRequestStatus =
  | "Submitted"
  | "Approved"
  | "Rejected"
  | "Fulfilled"
  | "Cancelled";

export type RepairRequest = {
  id: string;
  requesterUserId: string;
  /** Resolved for display via the AstEmployee.userId identity bridge. */
  requesterName?: string | null;
  requesterEmployeeId?: string | null;
  assetId: string;
  /** Resolved asset name / code (asset is a real FK, joined via include). */
  assetName?: string | null;
  assetCode?: string | null;
  assetCategoryName?: string | null;
  issueTitle: string;
  issueDescription: string;
  urgency: RepairRequestUrgency;
  status: RepairRequestStatus;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  decisionNote?: string | null;
  /** Set once the request is "sent to repair" — the created AstRepair. */
  repairId?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Decision an approver can take on a repair request. */
export type RepairRequestDecision = "approve" | "reject";
