/**
 * Prefixes stamped on `CnApprovalHistory.comments` when an approval was not a
 * plain step approval.
 *
 * History has no `actedVia` column, so the marker is what makes these
 * findable — both to an auditor grepping the table and to the DTO, which turns
 * them into booleans for the timeline. They live in their own module because
 * both the writers (master-approve, complete-repaired-approval) and the readers
 * (approval-dto, claim-instance) need them, and importing across those would
 * otherwise cycle.
 *
 * Changing a value orphans existing rows — extend rather than rename.
 */

/** The master approver's own closing row. */
export const MASTER_APPROVAL_MARKER = "[Master Approval]";

/** A step the master approval skipped on its way to closing the request. */
export const MASTER_APPROVAL_SKIP_MARKER = "[Skipped by Master Approval]";

/** An admin closing a request whose workflow steps were removed under it. */
export const REPAIR_COMPLETION_MARKER = "[Completed by admin";

/** An action taken on a step the instance was re-pointed to. */
export const REPOINT_MARKER = "[Step re-pointed";