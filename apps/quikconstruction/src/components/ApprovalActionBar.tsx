"use client";

/**
 * ApprovalActionBar — unified approve/reject/return surface.
 *
 * Drop this into any detail page that needs approver actions. Handles:
 *   - Hiding the bar entirely if the user lacks the required permission
 *   - Hiding if the entity is not in a `pending_approval` state
 *   - Required-comment modal for reject/return
 *   - Success/conflict feedback
 *   - Automatic query invalidation after action
 *
 * Usage:
 *   <ApprovalActionBar
 *     entityType="mr"
 *     entityId={mr.id}
 *     currentStatus={mr.status}
 *     requiredPermission="purchase.mr.approve"
 *     actionEndpoint={`/api/purchase/requisitions/${mr.id}/approve`}
 *     invalidateKeys={[["purchase-requisitions"], ["purchase-requisition", mr.id]]}
 *   />
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, RotateCcw, AlertTriangle } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";

export type ApprovalAction = "approve" | "reject" | "return";

interface Props {
  entityType: string;
  entityId: string;
  currentStatus: string | undefined;
  /** Permission the user needs to see ANY of the action buttons. */
  requiredPermission: string;
  /** POST target. Called with `{ action, comments, ...extraBody }`. */
  actionEndpoint: string;
  /**
   * Which statuses allow approver actions. Defaults to a sensible set:
   * "submitted", "pending_approval", "pending_l1/l2/l3", "under_review".
   */
  actionableStatuses?: string[];
  /** React Query keys to invalidate on success. */
  invalidateKeys?: Array<readonly unknown[]>;
  /** Optional callback after success (navigation, toast, etc.) */
  onSuccess?: (action: ApprovalAction) => void;
  /** Override button labels if entity uses different terminology. */
  labels?: Partial<Record<ApprovalAction, string>>;
  /**
   * Called on every action to let the caller merge per-entity payload
   * into the POST body. E.g. the PR detail page uses this to inject the
   * approver-picked `sourceLocationId` so the MI draft the approve route
   * auto-creates is already scoped to a warehouse.
   */
  extraBody?: () => Record<string, any>;
  /**
   * When true, the Approve button is disabled (reject/return still work).
   * Use this to gate approval on required UI state the caller owns —
   * e.g. "must pick a source location first".
   */
  approveDisabled?: boolean;
  /** Tooltip shown on the disabled Approve button. */
  approveDisabledReason?: string;
  /**
   * Workflow-aware visibility control. Callers that compute actor-match
   * from an approval instance should set this explicitly:
   *   - `true`  → hide the bar (current user is not the expected actor).
   *   - `false` → show the bar AND skip the legacy `requiredPermission`
   *               check, because the caller has already proven the user
   *               is the right actor for the current step.
   *   - `undefined` (not set) → legacy mode: fall back to the
   *               `requiredPermission` gate, preserving behaviour for
   *               callers that haven't migrated to workflow-step gating.
   */
  hidden?: boolean;
}

const DEFAULT_ACTIONABLE = [
  "submitted",
  "pending_approval",
  "pending_l1",
  "pending_l2",
  "pending_l3",
  "under_review",
  "approved_l1",
  "approved_l2",
];

export function ApprovalActionBar(props: Props) {
  const {
    entityType,
    entityId,
    currentStatus,
    requiredPermission,
    actionEndpoint,
    actionableStatuses = DEFAULT_ACTIONABLE,
    invalidateKeys = [],
    onSuccess,
    labels,
    extraBody,
    approveDisabled = false,
    approveDisabledReason,
    hidden,
  } = props;

  const qc = useQueryClient();
  const { can, isLoading } = usePermissions();
  const [pendingAction, setPendingAction] = useState<ApprovalAction | null>(null);
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [lastOk, setLastOk] = useState<ApprovalAction | null>(null);

  // Hide the whole bar when permissions still loading — avoids flash
  if (isLoading) return null;

  // Caller explicitly said "this user is not the actor for the current
  // workflow step" — suppress entirely.
  if (hidden === true) return null;

  // Legacy permission gate — only enforced when the caller hasn't opted
  // into workflow-aware gating. When `hidden` is explicitly `false` the
  // caller has already computed the authoritative answer (e.g. the PR
  // detail page uses `canActOnCurrentStep`), so this would double-gate
  // and incorrectly hide buttons from approvers whose role lacks the
  // legacy permission (e.g. HO_USER for a PR step).
  if (hidden === undefined && !can(requiredPermission)) return null;

  // Status gate — hide when entity isn't in an actionable state
  const normalized = (currentStatus ?? "").toLowerCase();
  const isActionable = actionableStatuses.includes(normalized);
  if (!isActionable) {
    if (lastOk) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4" />
          {lastOk === "approve" && "Approved successfully"}
          {lastOk === "reject" && "Rejected"}
          {lastOk === "return" && "Returned for revision"}
        </div>
      );
    }
    return null;
  }

  const closeModal = () => {
    setPendingAction(null);
    setComments("");
    setError("");
  };

  const execute = async (action: ApprovalAction) => {
    setSubmitting(true);
    setError("");
    try {
      const extra = extraBody ? extraBody() : {};
      const res = await fetch(actionEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `${entityType}-${entityId}-${action}-${Date.now()}`,
        },
        body: JSON.stringify({ action, comments, ...extra }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Already-acted conflict
        if (res.status === 409) {
          setError(
            body.error ??
              `This ${entityType} has already been acted on by another approver.`
          );
        } else if (res.status === 403) {
          setError(
            body.error ??
              "You don't have permission to perform this action on this step."
          );
        } else if (res.status === 400 && body.code === "COMMENT_REQUIRED") {
          setError("Comments are required for reject/return.");
          setSubmitting(false);
          return;
        } else {
          setError(body.error ?? `Failed to ${action} (HTTP ${res.status})`);
        }
        setSubmitting(false);
        return;
      }

      // Success — invalidate + close modal + show banner
      for (const key of invalidateKeys) {
        qc.invalidateQueries({ queryKey: key as any });
      }
      setLastOk(action);
      setPendingAction(null);
      setComments("");
      onSuccess?.(action);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const onButtonClick = (action: ApprovalAction) => {
    setError("");
    if (action === "approve") {
      // Approve is immediate — no comment required
      void execute("approve");
    } else {
      // Reject / return — open comment modal
      setPendingAction(action);
      setComments("");
    }
  };

  const label = (a: ApprovalAction, fallback: string) => labels?.[a] ?? fallback;

  return (
    <div className="flex items-center gap-2">
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="button"
        disabled={submitting || approveDisabled}
        onClick={() => onButtonClick("approve")}
        title={approveDisabled ? approveDisabledReason : undefined}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <CheckCircle2 className="w-4 h-4" />
        {submitting && pendingAction === null ? "..." : label("approve", "Approve")}
      </button>

      <button
        type="button"
        disabled={submitting}
        onClick={() => onButtonClick("return")}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium disabled:opacity-50"
      >
        <RotateCcw className="w-4 h-4" />
        {label("return", "Return")}
      </button>

      <button
        type="button"
        disabled={submitting}
        onClick={() => onButtonClick("reject")}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50"
      >
        <XCircle className="w-4 h-4" />
        {label("reject", "Reject")}
      </button>

      {/* Comment modal for reject/return */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => !submitting && closeModal()}
          />
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-gray-200 p-5 m-4">
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              {pendingAction === "reject" ? "Reject" : "Return for revision"}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Comments are required. They will be visible to the requester and
              recorded in the approval history.
            </p>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder={
                pendingAction === "reject"
                  ? "Reason for rejection..."
                  : "What needs to be revised?"
              }
              rows={4}
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
            {error && (
              <p className="mt-2 text-xs text-red-600">{error}</p>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!comments.trim()) {
                    setError("Comments are required.");
                    return;
                  }
                  void execute(pendingAction);
                }}
                disabled={submitting}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${
                  pendingAction === "reject"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-amber-500 hover:bg-amber-600"
                }`}
              >
                {submitting
                  ? "..."
                  : pendingAction === "reject"
                  ? "Reject"
                  : "Return"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
