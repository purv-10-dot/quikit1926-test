/**
 * Canonical registry of QuikAsset RBAC resources & actions.
 *
 * A permission is a `(resource, action)` pair. Roles are granted pairs via
 * `AstRolePermission`; users are assigned roles via `AstUserAppRole`; per-user
 * additive grants live in `AstUserPermissionExtra`. The sidebar derives its
 * visibility from the `view` grant on the resource named in `NAV_RESOURCE`.
 *
 * This is the single source of truth — both the seeder and the runtime gate
 * read from here so grants and checks can never drift.
 */
export const RESOURCES = [
  "Dashboard",
  "Asset",
  "Category",
  "Assignment",
  "Repair",
  "Replacement",
  "Budget",
  "Report",
  "AuditLog",
  "Notification",
  "Employee",
  "Settings",
] as const;

export const ACTIONS = ["view", "create", "update", "delete", "viewAll"] as const;

export type Resource = (typeof RESOURCES)[number];
export type Action = (typeof ACTIONS)[number];

const RESOURCE_SET = new Set<string>(RESOURCES);
const ACTION_SET = new Set<string>(ACTIONS);

export function isResource(value: string): value is Resource {
  return RESOURCE_SET.has(value);
}
export function isAction(value: string): value is Action {
  return ACTION_SET.has(value);
}

/** Resources that only ever support `view` (no create/update/delete). */
const VIEW_ONLY: ReadonlySet<Resource> = new Set<Resource>([
  "Dashboard",
  "Report",
  "AuditLog",
  "Notification",
]);

/**
 * Resources that support the `viewAll` capability — the right to see EVERY
 * record org-wide, not just those scoped to the caller. Only `Asset` has this
 * today: it separates "asset manager / admin (sees the full register)" from a
 * plain member (sees only their assigned assets, enforced in the route layer).
 * Held by admin/manager roles, never the default Member role.
 */
const VIEW_ALL_RESOURCES: ReadonlySet<Resource> = new Set<Resource>(["Asset"]);

/**
 * True when (resource, action) is a real pair in this registry — respects the
 * VIEW_ONLY restriction (those resources only ever grant `view`). Used by the
 * role/extras save endpoints to drop stale/unknown pairs instead of failing the
 * whole save when the registry has since been trimmed.
 */
export function isValidPermissionPair(resource: string, action: string): boolean {
  if (!isResource(resource) || !isAction(action)) return false;
  // `viewAll` is a special capability — valid only on the resources that opt in.
  if (action === "viewAll") return VIEW_ALL_RESOURCES.has(resource);
  if (VIEW_ONLY.has(resource)) return action === "view";
  return true;
}

/** Every valid (resource, action) pair in the registry. */
export function allPermissionPairs(): Array<{ resource: Resource; action: Action }> {
  const out: Array<{ resource: Resource; action: Action }> = [];
  for (const resource of RESOURCES) {
    if (VIEW_ONLY.has(resource)) {
      out.push({ resource, action: "view" });
    } else {
      for (const action of ACTIONS) {
        // `viewAll` only applies to opted-in resources — don't emit it everywhere.
        if (action === "viewAll" && !VIEW_ALL_RESOURCES.has(resource)) continue;
        out.push({ resource, action });
      }
    }
  }
  return out;
}

/** Maps a sidebar nav href to the resource whose `view` grant reveals it. */
export const NAV_RESOURCE: Record<string, Resource> = {
  "/dashboard": "Dashboard",
  "/assets": "Asset",
  "/assets/categories": "Category",
  "/assignments": "Assignment",
  "/repair": "Repair",
  "/audit-log": "AuditLog",
  "/notifications": "Notification",
  "/reports": "Report",
  "/users": "Employee",
  "/settings": "Settings",
  "/settings/user-management": "Settings",
};
