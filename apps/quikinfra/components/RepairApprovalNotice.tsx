"use client";

/**
 * Banner + admin action for an approval that its workflow can no longer
 * advance.
 *
 * When a workflow is edited mid-flight its step rows are replaced, so a
 * pending request can end up parked on a `stepOrder` that no longer exists.
 * If every surviving step is already approved, no approver has anything left
 * to act on — the request would sit as "Pending Approval" forever with all
 * its visible steps green. This surfaces why, and lets an admin close it
 * with a recorded reason.
 *
 * Presentational + self-posting: the caller supplies the endpoint and the
 * query keys to invalidate, this owns the dialog state and the request.
 */

import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PrimaryButton, SecondaryButton } from "./PageShell";
import { toErrorMessage } from "@/lib/api/errors";
import type { MeResponse } from "@/hooks/use-permissions";
import { USER_TYPE_CATALOG } from "@/lib/rbac/user-types";
import type { ApprovalRepairInfo } from "@/lib/approvals/approval-info";

/** Keep in sync with COMPLETE_REASON_MIN_LENGTH on the server. */
const REASON_MIN_LENGTH = 20;

interface RepairApprovalNoticeProps {
  repair: ApprovalRepairInfo | null | undefined;
  /** Label used in the copy — "indent", "DPR", "requisition". */
  entityLabel: string;
  /** POST target, e.g. `/api/purchase/indents/<id>/approve`. */
  actionEndpoint: string;
  invalidateKeys: Array<Array<string | number>>;
  /**
   * The viewer. Only admin-tier users are offered the action — everyone else
   * sees the explanation alone, so they stop waiting on a step that is gone.
   */
  me: MeResponse | null | undefined;
}

/** Mirrors the server gate in `validateRepairCompletion`. */
function isAdminTier(me: MeResponse | null | undefined): boolean {
  const type =
    me?.userType ??
    USER_TYPE_CATALOG.find((t) => t.backingRole === me?.roleKey)?.key;
  return type === "ADMIN" || type === "SUPER_ADMIN";
}

export function RepairApprovalNotice({
  repair,
  entityLabel,
  actionEndpoint,
  invalidateKeys,
  me,
}: RepairApprovalNoticeProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(actionEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", comments: reason.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json?.error ?? json?.error?.message ?? "Failed to complete approval",
        );
      }
      return json;
    },
    onSuccess: () => {
      invalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      setOpen(false);
      setReason("");
    },
    onError: (err: unknown) => {
      setError(toErrorMessage(err, "Failed to complete approval"));
      // Usually means someone else settled it first. Refetch so the page stops
      // offering an action on a closed request.
      invalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
    },
  });

  if (!repair?.orphaned) return null;

  const stepWord = repair.totalSteps === 1 ? "step" : "steps";

  return (
    <>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">
              Approval workflow was changed after this {entityLabel} was submitted
            </p>
            <p className="mt-1 text-sm text-amber-800">
              It is waiting at step {repair.missingStepOrder}, which no longer
              exists in the workflow. The workflow now has {repair.totalSteps}{" "}
              {stepWord}
              {repair.allStepsApproved
                ? ` — all of which are already approved, so no approver can advance it.`
                : `, so the remaining approver can act on it normally.`}
            </p>
            {repair.orphanedHistorySteps.length > 0 && (
              <p className="mt-1 text-xs text-amber-700">
                Step{repair.orphanedHistorySteps.length === 1 ? "" : "s"}{" "}
                {repair.orphanedHistorySteps.join(", ")} were approved before the
                workflow changed and are shown greyed out in the timeline.
              </p>
            )}
          </div>
          {repair.completable && isAdminTier(me) && (
            <PrimaryButton onClick={() => { setError(null); setOpen(true); }}>
              Complete Approval
            </PrimaryButton>
          )}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900">
                Complete approval
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
                {repair.totalSteps === 1
                  ? "The only step in the current workflow is already approved."
                  : `All ${repair.totalSteps} steps in the current workflow are already approved.`}{" "}
                Completing marks this {entityLabel} as approved and runs its
                normal post-approval effects.
              </p>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Reason <span className="text-red-500">*</span>{" "}
                  <span className="font-normal text-gray-400">
                    (min {REASON_MIN_LENGTH} characters — recorded in approval history)
                  </span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
                  placeholder="e.g. Workflow was reduced from 4 steps to 2 while this was mid-approval; all required approvals already obtained."
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
                onClick={() => { setError(null); mutation.mutate(); }}
                disabled={
                  mutation.isPending || reason.trim().length < REASON_MIN_LENGTH
                }
              >
                {mutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Complete Approval
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
