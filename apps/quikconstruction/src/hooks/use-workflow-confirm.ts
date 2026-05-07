"use client";

/**
 * Shared workflow-confirmation state hook used by detail pages that
 * expose Submit / Approve / Reject for entities backed by the generic
 * `CnApprovalWorkflow` system (Material Estimation, Work Orders, etc.).
 *
 * Callers supply the per-entity endpoints and invalidation queue. The
 * hook owns the transient state (action kind, reject-reason textarea,
 * in-flight flag) and returns helpers to open/close the dialog and
 * fire the action. Rendering of the ConfirmDialog stays with the
 * caller so titles / tone / phrasing remain entity-specific.
 */
import { useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

export type WorkflowKind = "submit" | "approve" | "reject";

export interface WorkflowConfirmConfig {
  /** POST endpoint for Submit for Approval. */
  submitUrl: string;
  /** POST endpoint for Approve / Reject (body carries `action`). */
  approveUrl: string;
  /** Query keys to invalidate after a successful action. */
  invalidateKeys?: QueryKey[];
}

export function useWorkflowConfirm(config: WorkflowConfirmConfig) {
  const qc = useQueryClient();
  const [action, setAction] = useState<WorkflowKind | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (kind: WorkflowKind) => {
    setError(null);
    setRejectReason("");
    setAction(kind);
  };
  const close = () => {
    if (pending) return;
    setAction(null);
    setRejectReason("");
    setError(null);
  };

  const run = async () => {
    if (!action) return;
    setPending(true);
    setError(null);
    try {
      const res =
        action === "submit"
          ? await fetch(config.submitUrl, { method: "POST" })
          : await fetch(config.approveUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: action === "approve" ? "approve" : "reject",
                comments: action === "reject" ? rejectReason.trim() : undefined,
              }),
            });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      for (const key of config.invalidateKeys ?? []) {
        qc.invalidateQueries({ queryKey: key });
      }
      setAction(null);
      setRejectReason("");
    } catch (err: any) {
      setError(err?.message ?? "Action failed");
    } finally {
      setPending(false);
    }
  };

  return {
    action,
    rejectReason,
    setRejectReason,
    pending,
    error,
    open,
    close,
    run,
  };
}
