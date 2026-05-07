"use client";

/**
 * <Can> — Declarative Permission Gate for JSX
 *
 * Renders its children only if the current user holds the required
 * permission(s). Invisible while `/api/me` is loading so UI doesn't flash.
 *
 * Examples:
 *
 *   <Can permission="boq.lock">
 *     <button onClick={lock}>Lock BOQ</button>
 *   </Can>
 *
 *   <Can permission={["purchase.po.approve_l1", "purchase.po.approve_l2"]}>
 *     <ApprovalPanel />
 *   </Can>
 *
 *   <Can permission="boq.unlock" fallback={<LockedBadge />}>
 *     <UnlockButton />
 *   </Can>
 *
 *   <Can role={["project_manager", "project_director"]}>
 *     <ProjectSettingsLink />
 *   </Can>
 *
 * IMPORTANT: This is UX only. Server-side checks are the authoritative gate.
 */

import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/use-permissions";

interface CanProps {
  /** One permission key, or a list (ANY matches pass). */
  permission?: string | string[];
  /** One role key, or a list. Takes precedence if both are supplied. */
  role?: string | string[];
  /** Require ALL listed permissions instead of ANY. */
  all?: boolean;
  /** Rendered when the check fails. */
  fallback?: ReactNode;
  /** Rendered while /api/me is loading (default: null). */
  loading?: ReactNode;
  children: ReactNode;
}

export function Can({
  permission,
  role,
  all = false,
  fallback = null,
  loading = null,
  children,
}: CanProps) {
  const { isLoading, can, canAll, hasRole } = usePermissions();

  if (isLoading) return <>{loading}</>;

  let allowed = false;
  if (role) {
    allowed = hasRole(role);
  } else if (permission) {
    allowed = all && Array.isArray(permission) ? canAll(permission) : can(permission);
  } else {
    // No criteria → always render. Useful for consistency in lists.
    allowed = true;
  }

  return <>{allowed ? children : fallback}</>;
}

/**
 * Convenience wrapper for disabling (rather than hiding) an element when
 * the user lacks a permission. Useful for buttons where you want to show
 * a tooltip explaining why it's disabled.
 *
 *   <CanDisable permission="boq.lock">
 *     {(disabled) => <button disabled={disabled}>Lock BOQ</button>}
 *   </CanDisable>
 */
interface CanDisableProps {
  permission?: string | string[];
  role?: string | string[];
  all?: boolean;
  children: (disabled: boolean) => ReactNode;
}

export function CanDisable({ permission, role, all = false, children }: CanDisableProps) {
  const { isLoading, can, canAll, hasRole } = usePermissions();

  if (isLoading) return <>{children(true)}</>;

  let allowed = false;
  if (role) allowed = hasRole(role);
  else if (permission)
    allowed = all && Array.isArray(permission) ? canAll(permission) : can(permission);
  else allowed = true;

  return <>{children(!allowed)}</>;
}
