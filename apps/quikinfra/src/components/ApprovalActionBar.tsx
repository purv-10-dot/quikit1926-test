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

import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, RotateCcw, AlertTriangle, X } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "@/lib/toast";

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
  extraBody?: () => Record<string, unknown>;
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
  // Track mount so the portal target (document.body) is only accessed on the
  // client — Next.js SSR would otherwise throw "document is not defined".
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

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
        let message: string;
        // Already-acted conflict
        if (res.status === 409) {
          message =
            body.error ??
            `This ${entityType} has already been acted on by another approver.`;
        } else if (res.status === 403) {
          message =
            body.error ??
            "You don't have permission to perform this action on this step.";
        } else if (res.status === 400 && body.code === "COMMENT_REQUIRED") {
          message = "Comments are required for reject/return.";
          setError(message);
          toast.error(message);
          setSubmitting(false);
          return;
        } else {
          message = body.error ?? `Failed to ${action} (HTTP ${res.status})`;
        }
        setError(message);
        toast.error(message);
        setSubmitting(false);
        return;
      }

      // Success — invalidate + close modal + show banner
      for (const key of invalidateKeys) {
        qc.invalidateQueries({ queryKey: key });
      }
      setLastOk(action);
      setPendingAction(null);
      setComments("");
      toast.success(
        action === "approve"
          ? "Approved successfully"
          : action === "reject"
            ? "Rejected"
            : "Returned for revision",
      );
      onSuccess?.(action);
    } catch (err: unknown) {
      const message = toErrorMessage(err, "Network error");
      setError(message);
      toast.error(message);
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

      {/* Comment modal for reject/return — rendered in a portal so it
          escapes any parent transform/overflow (e.g. PageHeader's action
          slot) that would otherwise clip its `fixed inset-0` backdrop and
          push it off-centre. */}
      {pendingAction && portalReady && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="approval-action-title"
        >
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => !submitting && closeModal()}
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div
              className={`flex items-start gap-3 px-5 py-4 border-b border-gray-100 ${
                pendingAction === "reject"
                  ? "bg-gradient-to-r from-rose-50 to-white"
                  : "bg-gradient-to-r from-amber-50 to-white"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  pendingAction === "reject"
                    ? "bg-rose-100 text-rose-600"
                    : "bg-amber-100 text-amber-600"
                }`}
              >
                {pendingAction === "reject" ? (
                  <XCircle className="w-5 h-5" />
                ) : (
                  <RotateCcw className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3
                  id="approval-action-title"
                  className="text-base font-bold text-gray-900"
                >
                  {pendingAction === "reject"
                    ? "Reject this request"
                    : "Return for revision"}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  {pendingAction === "reject"
                    ? "This will end the approval workflow. The requester will see your reason and the request cannot be resubmitted as-is."
                    : "The request will go back to the requester so they can revise and resubmit it."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-50 rounded-md p-1 hover:bg-white/60 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              <label
                htmlFor="approval-action-comments"
                className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1.5"
              >
                {pendingAction === "reject"
                  ? "Reason for rejection"
                  : "What needs to be revised?"}
                <span className="text-rose-500 ml-0.5">*</span>
              </label>
              <textarea
                id="approval-action-comments"
                value={comments}
                onChange={(e) => {
                  setComments(e.target.value);
                  if (error) setError("");
                }}
                placeholder={
                  pendingAction === "reject"
                    ? "Explain why this request is being rejected. The requester will see this comment."
                    : "Describe the changes needed so the requester knows what to fix."
                }
                rows={4}
                autoFocus
                className={`w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 resize-none transition-colors ${
                  error
                    ? "border-rose-300 focus:ring-rose-200 focus:border-rose-400"
                    : "border-gray-300 focus:ring-orange-200 focus:border-orange-400"
                }`}
              />
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                <span className={error ? "text-rose-600 font-medium" : "text-gray-400"}>
                  {error || "Visible to the requester and recorded in the approval history."}
                </span>
                <span className="text-gray-400 tabular-nums shrink-0">
                  {comments.trim().length} chars
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!comments.trim()) {
                    setError("Please add a comment before continuing.");
                    return;
                  }
                  void execute(pendingAction);
                }}
                disabled={submitting}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                  pendingAction === "reject"
                    ? "bg-rose-600 hover:bg-rose-700"
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
        </div>,
        document.body,
      )}
    </div>
  );
}
