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

export interface ApprovalInfo {
  status?: string | null;
  currentStepOrder?: number | null;
  /** Server-computed: whether the current user can act on the current step. */
  canActOnCurrentStep?: boolean | null;
  requestedByName?: string | null;
  requestedAt?: string | null;
  workflow?: { steps?: ApprovalStep[] } | null;
  history?: ApprovalHistoryEntry[];
}
