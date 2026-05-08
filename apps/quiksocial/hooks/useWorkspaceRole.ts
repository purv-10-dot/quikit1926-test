/**
 * useWorkspaceRole — client hook for the caller's role in a given brand.
 *
 * Calls GET /api/workspace-role?brandId=X. Designed to drive role-aware
 * UI (button gating, sidebar links). Returns defaults while brandId is
 * null/empty so consumers can call it unconditionally.
 *
 * isAdmin includes "approver" — both can approve/schedule/publish.
 * isMember is strict (only "member").
 *
 * Race-condition safety
 * ---------------------
 * `isLoading` is true synchronously from the very first render after
 * `brandId` becomes non-null, until the API has actually replied for
 * that exact brandId. Without this, consumers like the Approval page's
 * "redirect non-admins to /dashboard" effect would observe
 * `isLoading=false + role=null` on the initial render (because the
 * fetch lives in a useEffect that hasn't fired yet) and incorrectly
 * conclude the user has no access.
 *
 * Implementation: track which brandId the current `role` was fetched
 * for. While `resolvedFor !== brandId`, the hook is loading by
 * definition — even on the first render, even mid-flight when brandId
 * changes. The no-brand case (brandId == null) is itself a resolved
 * state, so consumers without a brand never see isLoading=true.
 */

import { useEffect, useState } from "react";
import { unwrap } from "@/lib/utils/api-fetch";

export type WorkspaceRole = "admin" | "member" | "approver";

export interface WorkspaceRoleResult {
  role: WorkspaceRole | null;
  isAdmin: boolean;
  isMember: boolean;
  isLoading: boolean;
}

export function useWorkspaceRole(brandId: string | null | undefined): WorkspaceRoleResult {
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  // The brandId the current `role` was fetched for, or `null` to mark
  // the "no brand" case as resolved. Lazy-initialised from the prop so
  // the very first render correctly reports loading=true when brandId
  // is non-null. Subsequent brandId changes flip resolvedFor back to
  // a stale value until the new fetch completes.
  const [resolvedFor, setResolvedFor] = useState<string | null | undefined>(
    () => (brandId == null ? null : undefined),
  );

  useEffect(() => {
    if (!brandId) {
      setRole(null);
      setResolvedFor(null);
      return;
    }

    let cancelled = false;
    fetch(`/api/workspace-role?brandId=${encodeURIComponent(brandId)}`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : { role: null }))
      .then(unwrap)
      .then((data) => {
        if (cancelled) return;
        const next: WorkspaceRole | null =
          data?.role === "admin" || data?.role === "member" || data?.role === "approver"
            ? data.role
            : null;
        setRole(next);
        setResolvedFor(brandId);
      })
      .catch(() => {
        if (cancelled) return;
        setRole(null);
        setResolvedFor(brandId);
      });

    return () => {
      cancelled = true;
    };
  }, [brandId]);

  // resolvedFor === undefined: no fetch has completed for any brandId yet
  //   → loading whenever brandId is non-null (we expect a fetch).
  // resolvedFor === null: the no-brand state is settled.
  //   → loading whenever brandId is non-null (transitioning to a real brand).
  // resolvedFor === some string: we have a settled role for that brandId.
  //   → loading whenever brandId differs from that string.
  const targetKey = brandId ?? null;
  const isLoading =
    resolvedFor === undefined ? brandId != null : resolvedFor !== targetKey;

  return {
    role,
    isAdmin: role === "admin" || role === "approver",
    isMember: role === "member",
    isLoading,
  };
}
