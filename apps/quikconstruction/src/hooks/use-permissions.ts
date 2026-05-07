"use client";

/**
 * usePermissions — Client-side Permission Gate Hook
 *
 * Fetches /api/me once per session, caches in React Query, and exposes
 * predicates for hiding/disabling UI actions.
 *
 * Usage:
 *
 *   const { can, isLoading, roleKey } = usePermissions();
 *
 *   if (isLoading) return <Spinner />;
 *
 *   return (
 *     <div>
 *       {can("boq.lock") && <button onClick={lock}>Lock BOQ</button>}
 *       <button disabled={!can("boq.write")}>Add item</button>
 *     </div>
 *   );
 *
 * Or use the declarative <Can> component in components/can.tsx.
 *
 * IMPORTANT: These helpers are purely for UX — hiding buttons the user can't
 * click. Server-side checks (requirePermission) are the ONLY authoritative
 * gate. Never trust the client.
 */

import { useQuery } from "@tanstack/react-query";
import { menuKeyForUrl, buildMatrixFromModules } from "@/lib/rbac/menu-catalog";

export interface MeResponse {
  userId: string;
  userEmail: string;
  userName: string;
  tenantId: string;
  orgId: string;
  roleKey: string;
  /** PDF-spec user type from users.userType — drives the sidebar chip. */
  userType: string | null;
  permissions: string[];
  projectIds: string[] | null;
  /** Null = not restricted (super admin). Array = whitelist of module keys. */
  modulesAssigned: string[] | null;
  /** Null = not restricted. Otherwise per-menu Add/Edit/Delete/View grid. */
  permissionMatrix: Record<string, Record<string, boolean>> | null;
}

async function fetchMe(): Promise<MeResponse> {
  const res = await fetch("/api/me", { credentials: "same-origin" });
  // 401 means the JWT cookie is still valid but the user no longer is —
  // typically because an admin deactivated the account. The server-side
  // getTenantContext() rejects deactivated users rows; we react here
  // by signing out, which clears the cookie and bounces to /login.
  // Without this the user would keep clicking around with stale
  // permissions, getting 401s on each call.
  if (res.status === 401) {
    const { signOut } = await import("next-auth/react");
    await signOut({ callbackUrl: "/login" });
    throw new Error("Session invalidated");
  }
  if (!res.ok) throw new Error(`Failed to load /api/me: ${res.status}`);
  return res.json();
}

export function usePermissions() {
  const query = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    // Short staleTime + interval polling so a user who's deactivated
    // mid-session is kicked out within ~30 seconds, not after the
    // 1-year cookie expiry. The /api/me handler is cheap (one DB read).
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 30 * 1000,
    retry: 1,
  });

  const perms = new Set(query.data?.permissions ?? []);
  const isSuper = perms.has("*");

  function can(permission: string | string[]): boolean {
    if (isSuper) return true;
    if (Array.isArray(permission)) {
      return permission.some((p) => perms.has(p));
    }
    return perms.has(permission);
  }

  function canAll(permissions: string[]): boolean {
    if (isSuper) return true;
    return permissions.every((p) => perms.has(p));
  }

  function hasRole(roleKeys: string | string[]): boolean {
    const actual = query.data?.roleKey;
    if (!actual) return false;
    if (actual === "platform_super_admin" || actual === "tenant_admin") return true;
    const targets = Array.isArray(roleKeys) ? roleKeys : [roleKeys];
    return targets.includes(actual);
  }

  const modulesAssigned = query.data?.modulesAssigned ?? null;
  const permissionMatrix = query.data?.permissionMatrix ?? null;

  /**
   * Effective matrix: admins have none (isSuper bypasses), users with a
   * saved matrix get that verbatim, users without a saved matrix get a
   * default built from `modulesAssigned` — items in assigned modules get
   * view=true, items in unassigned modules (notably SYSTEM: Approvals,
   * Reports) get view=false. This means SYSTEM items are hidden by
   * default for non-admin users without requiring every admin to visit
   * and hand-save each user's permissions page first.
   */
  const effectiveMatrix = (() => {
    if (permissionMatrix) return permissionMatrix as Record<string, Record<string, boolean>>;
    if (modulesAssigned) return buildMatrixFromModules(modulesAssigned);
    return null;
  })();

  /**
   * Check whether the current user has access to a given module. `null`
   * modulesAssigned = unrestricted (super admin) → always true. An empty
   * array = restricted but nothing assigned → always false.
   */
  function hasModule(moduleKey: string): boolean {
    if (isSuper) return true;
    if (modulesAssigned === null) return true;
    return modulesAssigned.includes(moduleKey);
  }

  /**
   * Check whether the user can view a specific menu item by its nav URL.
   * Consults the effective matrix (saved user matrix, or default-from-
   * modules fallback). Returns `true` when there's no matrix at all
   * (super admin), or when the URL doesn't map to a menu-catalog key —
   * in that case the caller falls through to `hasModule` / role-based
   * `requiredPermission` gates.
   */
  function canViewMenu(url: string | undefined): boolean {
    if (isSuper) return true;
    if (!effectiveMatrix) return true;
    const key = menuKeyForUrl(url);
    if (!key) return true;
    const row = effectiveMatrix[key];
    if (!row) return true;
    return row.view !== false;
  }

  /**
   * Check whether the user can perform a specific action (`add`, `edit`,
   * `delete`, `view`) on the page identified by the given nav URL.
   * Used by the dashboard's Quick Actions to hide create-shortcuts when
   * the user doesn't have `add` rights on the target page, and by
   * page-level Add / Edit / Delete buttons that want a single source
   * of truth instead of re-deriving the matrix lookup.
   *
   * Same fall-through semantics as `canViewMenu`: super admin → true;
   * no matrix → true; URL not in menu catalog → true. Only returns
   * `false` when the matrix explicitly denies the action.
   */
  function canMenuAction(
    url: string | undefined,
    action: "view" | "add" | "edit" | "delete",
  ): boolean {
    if (isSuper) return true;
    if (!effectiveMatrix) return true;
    const key = menuKeyForUrl(url);
    if (!key) return true;
    const row = effectiveMatrix[key];
    if (!row) return true;
    return row[action] !== false;
  }

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    me: query.data,
    roleKey: query.data?.roleKey ?? null,
    userType: query.data?.userType ?? null,
    permissions: perms,
    modulesAssigned,
    permissionMatrix,
    can,
    canAll,
    hasRole,
    hasModule,
    canViewMenu,
    canMenuAction,
    isSuper,
  };
}
