"use client";

/**
 * WorkflowConfirmDialog — thin wrapper around `ConfirmDialog` for the
 * Submit / Approve / Reject modal shared by every entity backed by the
 * generic `CnApprovalWorkflow` system (Material Estimation, Work
 * Orders, ...).
 *
 * Consumer supplies the entity noun ("Work Order", "Estimation") and
 * the label shown on the confirmation target (usually the entity
 * number); this component fills in the title, button, tone, and the
 * reason-textarea block for rejections.
 */
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";

export type WorkflowKind = "submit" | "approve" | "reject";

export interface WorkflowConfirmDialogProps {
  action: WorkflowKind | null;
  pending: boolean;
  rejectReason: string;
  onRejectReasonChange: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  /** Singular noun for the entity, e.g. "Work Order". */
  entityNoun: string;
  /** The entity's user-facing identifier, e.g. its number. */
  entityLabel: ReactNode;
  /** Optional entity-specific flavour copy appended to each prompt. */
  approveHint?: string;
  submitHint?: string;
  rejectHint?: string;
  /** Placeholder for the rejection-reason textarea. */
  rejectPlaceholder?: string;
  /** Server-returned error to render as an inline banner inside the
   *  dialog. Pages that already render their own page-level error banner
   *  (Work Order detail page, Material Estimation, ...) can leave this
   *  unset; list-style pages without an outer banner pass it in so the
   *  user doesn't get a browser alert. */
  error?: string | null;
}

export function WorkflowConfirmDialog({
  action,
  pending,
  rejectReason,
  onRejectReasonChange,
  onClose,
  onConfirm,
  entityNoun,
  entityLabel,
  approveHint,
  submitHint,
  rejectHint,
  rejectPlaceholder = "Reason for rejection…",
  error,
}: WorkflowConfirmDialogProps) {
  const title =
    action === "submit"
      ? "Submit for Approval"
      : action === "approve"
        ? `Approve ${entityNoun}`
        : action === "reject"
          ? `Reject ${entityNoun}`
          : "";
  const confirmLabel =
    action === "submit" ? "Submit" : action === "approve" ? "Approve" : "Reject";

  return (
    <ConfirmDialog
      open={!!action}
      onClose={onClose}
      onConfirm={onConfirm}
      loading={pending}
      tone={action === "reject" ? "danger" : "primary"}
      title={title}
      confirmLabel={confirmLabel}
      message={
        action ? (
          <div className="space-y-3">
            <div>
              {action === "submit" && (
                <>
                  Send {entityNoun.toLowerCase()}{" "}
                  <span className="font-semibold text-gray-900">
                    {entityLabel}
                  </span>{" "}
                  into the approval queue?{" "}
                  {submitHint ??
                    `You won't be able to edit it until an approver actions it.`}
                </>
              )}
              {action === "approve" && (
                <>
                  Approve {entityNoun.toLowerCase()}{" "}
                  <span className="font-semibold text-gray-900">
                    {entityLabel}
                  </span>
                  ? {approveHint ?? ""}
                </>
              )}
              {action === "reject" && (
                <>
                  Reject {entityNoun.toLowerCase()}{" "}
                  <span className="font-semibold text-gray-900">
                    {entityLabel}
                  </span>
                  ?{" "}
                  {rejectHint ??
                    "The raiser will see your reason and can revise and resubmit."}
                </>
              )}
            </div>
            {action === "reject" && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Reason
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => onRejectReasonChange(e.target.value)}
                  rows={3}
                  placeholder={rejectPlaceholder}
                  disabled={pending}
                  autoFocus
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:bg-gray-50"
                />
              </div>
            )}
            {error && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>{error}</div>
              </div>
            )}
          </div>
        ) : null
      }
    />
  );
}
