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

export interface ApprovalInfo {
  status?: string | null;
  currentStepOrder?: number | null;
  /** Null unless the instance is pending. */
  repair?: ApprovalRepairInfo | null;
  /** Server-computed: whether the current user can act on the current step. */
  canActOnCurrentStep?: boolean | null;
  requestedByName?: string | null;
  requestedAt?: string | null;
  workflow?: { steps?: ApprovalStep[] } | null;
  history?: ApprovalHistoryEntry[];
}
