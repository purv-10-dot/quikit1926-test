/**
 * Client-side view-model for the approval block the detail pages render
 * (status chip, step timeline, action history). This is the enriched shape
 * the list/detail APIs attach as `approval` on each approvable document —
 * shared here so the ~9 detail pages and their hooks don't each redeclare it.
 */
export interface ApprovalStep {
  stepOrder: number;
  approverUserId?: string | null;
  approverUserIds?: string[] | null;
  approverUserName?: string | null;
  approverRoleId?: string | null;
}

export interface ApprovalHistoryEntry {
  stepOrder: number;
  action: string;
  actionById?: string | null;
  actionByName?: string | null;
  actionAt?: string | null;
  comments?: string | null;
  /** The master approver's own closing row. */
  isMasterApproval?: boolean;
  /**
   * A step the master approval skipped. Carries the master approver's id, so
   * the timeline must name the step's configured approver instead.
   */
  isMasterSkip?: boolean;
}

/**
 * Set when a pending instance's workflow was edited after submission, so the
 * step it is parked on may no longer exist. Drives the "workflow changed"
 * banner and the admin Complete Approval action.
 */
export interface ApprovalRepairInfo {
  orphaned: boolean;
  missingStepOrder: number | null;
  totalSteps: number;
  lastStepOrder: number | null;
  allStepsApproved: boolean;
  /** History step orders with no matching step left in the workflow. */
  orphanedHistorySteps: number[];
  /** Orphaned AND every surviving step already approved — nothing left to approve. */
  completable: boolean;
}

/**
 * The workflow's named fallback approver, when one is configured. Present
 * regardless of whether it has been used: while pending it tells the requester
 * who can unblock the request, and after use it attributes the approval.
 */
export interface MasterApproverInfo {
  userId: string;
  name: string;
}

/** Set once a master approval has closed the request. */
export interface MasterApprovedByInfo {
  name: string;
  at: string;
  stepOrder: number;
}

export interface ApprovalInfo {
  status?: string | null;
  currentStepOrder?: number | null;
  requestedById?: string | null;
  /** Null unless the instance is pending. */
  repair?: ApprovalRepairInfo | null;
  masterApprover?: MasterApproverInfo | null;
  masterApprovedBy?: MasterApprovedByInfo | null;
  /** Server-computed: whether the current user can act on the current step. */
  canActOnCurrentStep?: boolean | null;
  requestedByName?: string | null;
  requestedAt?: string | null;
  workflow?: { steps?: ApprovalStep[] } | null;
  history?: ApprovalHistoryEntry[];
}
