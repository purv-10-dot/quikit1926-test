"use client";

/**
 * Master Approval — button + reason modal for the workflow's named fallback
 * approver.
 *
 * Rendered on the normal request detail page, alongside everything else the
 * page shows: the master approver sees exactly the same document as any other
 * user, with this one extra action. Clicking it asks why the chain is being
 * short-cut, then closes the request outright — any remaining steps are
 * skipped, because the master approver outranks the individual approvers.
 *
 * Visibility is decided here from the viewer and the approval DTO; the server
 * re-checks everything (named master, not the requester, reason length,
 * org scope) so a stale page can never grant the action.
 */

import { useState } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PrimaryButton, SecondaryButton } from "./PageShell";
import { toErrorMessage } from "@/lib/api/errors";
import type { MeResponse } from "@/hooks/use-permissions";
import type { ApprovalInfo } from "@/lib/approvals/approval-info";

/** Keep in sync with MASTER_APPROVAL_REASON_MIN_LENGTH on the server. */
const REASON_MIN_LENGTH = 20;

interface MasterApprovalActionProps {
  approval: ApprovalInfo | null | undefined;
  me: MeResponse | null | undefined;
  /** Label used in the copy — "indent", "DPR", "PR". */
  entityLabel: string;
  /** POST target, e.g. `/api/purchase/indents/<id>/approve`. */
  actionEndpoint: string;
  invalidateKeys: Array<Array<string | number>>;
}

/**
 * True when this viewer is the workflow's master approver and the request is
 * still open. Self-raised requests are excluded — the point of the fallback is
 * a second pair of eyes when the first is unavailable.
 */
export function canMasterApprove(
  approval: ApprovalInfo | null | undefined,
  me: MeResponse | null | undefined,
): boolean {
  if (!approval || !me?.userId) return false;
  if (approval.status !== "pending_approval") return false;
  if (!approval.masterApprover) return false;
  if (approval.masterApprover.userId !== me.userId) return false;
  if (approval.requestedById && approval.requestedById === me.userId) {
    return false;
  }
  return true;
}

/**
 * Header pill shown once a master approval has closed the request, so the
 * outcome is attributable at a glance instead of only inside the timeline.
 */
export function MasterApprovedBadge({
  approval,
}: {
  approval: ApprovalInfo | null | undefined;
}) {
  const info = approval?.masterApprovedBy;
  if (!info) return null;
  return (
    <span
      title={`Approved at step ${info.stepOrder} by ${info.name} as the workflow's master approver`}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-accent-200 bg-accent-50 px-2.5 py-1 text-[11px] font-semibold text-accent-700"
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      Approved by Master Approver
    </span>
  );
}

export function MasterApprovalAction({
  approval,
  me,
  entityLabel,
  actionEndpoint,
  invalidateKeys,
}: MasterApprovalActionProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(actionEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "master_approve",
          comments: reason.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? "Master approval failed");
      }
      return json;
    },
    onSuccess: () => {
      invalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      setOpen(false);
      setReason("");
    },
    onError: (err: unknown) => {
      setError(toErrorMessage(err, "Master approval failed"));
      // Usually means the step's own approver settled it first. Refetch so the
      // page stops offering an action on a closed request.
      invalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
    },
  });

  if (!canMasterApprove(approval, me)) return null;

  return (
    <>
      <PrimaryButton
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <ShieldCheck className="h-4 w-4" /> Master Approval
      </PrimaryButton>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <ShieldCheck className="h-4 w-4 text-accent-600" />
                Master Approval
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={mutation.isPending}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-5 py-4">
              <p className="text-sm text-gray-700">
                You are approving this {entityLabel} as the workflow&apos;s master
                approver. It will be marked{" "}
                <span className="font-semibold">Approved</span> immediately and
                any remaining approval steps will be skipped.
              </p>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Reason <span className="text-red-500">*</span>{" "}
                  <span className="font-normal text-gray-400">
                    (min {REASON_MIN_LENGTH} characters — shown in the approval
                    timeline)
                  </span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
                  placeholder="e.g. Step 2 approver is on leave until next month and the material is required on site this week."
                />
                <p className="mt-1 text-xs text-gray-400">
                  {reason.trim().length}/{REASON_MIN_LENGTH}
                </p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
              <SecondaryButton
                onClick={() => setOpen(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </SecondaryButton>
              <PrimaryButton
                onClick={() => {
                  setError(null);
                  mutation.mutate();
                }}
                disabled={
                  mutation.isPending || reason.trim().length < REASON_MIN_LENGTH
                }
              >
                {mutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Approve
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
