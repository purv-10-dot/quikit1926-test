/**
 * QuikInfra — Approval Workflow Engine
 *
 * Reusable engine consumed by: PR, Indent, PO, GRN, WO, DPR,
 * Stock Reconciliation, and Returns.
 *
 * Features:
 * - Configurable workflow master per entity type
 * - Role/department-based routing
 * - Amount threshold conditions
 * - Status transitions with guards
 * - Approval timeline tracking
 * - Idempotent actions
 */

import type {
  ApprovalEntityType,
  ApprovalInstance,
  ApprovalHistoryEntry,
  ApprovalWorkflow,
  ApprovalWorkflowStep,
  ApprovalStatus,
} from "./types";

// ─── Status Transition Rules ────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "rejected", "returned"],
  approved: ["reversed"],
  rejected: [],
  returned: ["pending_approval", "cancelled"],
  reversed: [],
  cancelled: [],
};

export function canTransition(from: string, to: string): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

// ─── Workflow Resolution ────────────────────────────────────────────

export interface ApprovalContext {
  orgId: string;
  entityType: ApprovalEntityType;
  entityId: string;
  entityNumber: string;
  requestedById: string;
  amount?: number;
  projectId?: string;
  departmentId?: string;
}

/**
 * Find the matching workflow for an entity type.
 * In a real implementation, this queries CnApprovalWorkflow.
 */
export function resolveWorkflow(
  workflows: ApprovalWorkflow[],
  entityType: ApprovalEntityType
): ApprovalWorkflow | null {
  return workflows.find(
    (wf) => wf.entityType === entityType && wf.isActive
  ) ?? null;
}

/**
 * Determine applicable steps based on conditions (amount thresholds, etc.).
 */
export function resolveApplicableSteps(
  workflow: ApprovalWorkflow,
  context: { amount?: number }
): ApprovalWorkflowStep[] {
  return workflow.steps
    .filter((step) => {
      if (!step.isConditional) return true;

      // Amount threshold check
      if (step.amountThresholdMin != null && context.amount != null) {
        if (context.amount < Number(step.amountThresholdMin)) return false;
      }
      if (step.amountThresholdMax != null && context.amount != null) {
        if (context.amount > Number(step.amountThresholdMax)) return false;
      }

      return true;
    })
    .sort((a, b) => a.stepOrder - b.stepOrder);
}

// ─── Actions ────────────────────────────────────────────────────────

export interface ApprovalActionResult {
  success: boolean;
  newStatus: ApprovalStatus;
  message: string;
  isComplete: boolean;
}

/**
 * Process an approval action on an instance.
 */
export function processApprovalAction(
  instance: ApprovalInstance,
  totalSteps: number,
  action: "approve" | "reject" | "return" | "reverse",
  actorUserId: string,
  comments?: string
): ApprovalActionResult {
  const { status, currentStepOrder } = instance;

  // Validate transition
  if (action === "approve") {
    if (status !== "pending_approval") {
      return { success: false, newStatus: status as ApprovalStatus, message: "Cannot approve: not pending", isComplete: false };
    }

    const isLastStep = currentStepOrder >= totalSteps;
    return {
      success: true,
      newStatus: isLastStep ? "approved" : "pending_approval",
      message: isLastStep ? "Approved (final)" : `Approved step ${currentStepOrder}, forwarded to step ${currentStepOrder + 1}`,
      isComplete: isLastStep,
    };
  }

  if (action === "reject") {
    if (status !== "pending_approval") {
      return { success: false, newStatus: status as ApprovalStatus, message: "Cannot reject: not pending", isComplete: false };
    }
    return {
      success: true,
      newStatus: "rejected",
      message: "Rejected",
      isComplete: true,
    };
  }

  if (action === "return") {
    if (status !== "pending_approval") {
      return { success: false, newStatus: status as ApprovalStatus, message: "Cannot return: not pending", isComplete: false };
    }
    return {
      success: true,
      newStatus: "returned",
      message: "Returned for revision",
      isComplete: false,
    };
  }

  if (action === "reverse") {
    if (status !== "approved") {
      return { success: false, newStatus: status as ApprovalStatus, message: "Cannot reverse: not approved", isComplete: false };
    }
    return {
      success: true,
      newStatus: "reversed",
      message: "Reversed by authorized user",
      isComplete: true,
    };
  }

  return { success: false, newStatus: status as ApprovalStatus, message: "Unknown action", isComplete: false };
}

// ─── Notification Helpers ───────────────────────────────────────────

export interface ApprovalNotification {
  userId: string;
  title: string;
  message: string;
  actionUrl: string;
  category: "approval";
}

export function buildApprovalNotification(
  instance: ApprovalInstance,
  action: "approve" | "reject" | "return" | "reverse",
  actorName: string
): ApprovalNotification {
  const entityLabel = instance.entityType.replace(/_/g, " ");
  const actionLabel = {
    approve: "approved",
    reject: "rejected",
    return: "returned for revision",
    reverse: "reversed",
  }[action];

  return {
    userId: instance.requestedById,
    title: `${entityLabel} ${instance.entityNumber} ${actionLabel}`,
    message: `Your ${entityLabel} ${instance.entityNumber} was ${actionLabel} by ${actorName}.`,
    actionUrl: `/${instance.entityType.replace(/_/g, "-")}/${instance.entityId}`,
    category: "approval",
  };
}
