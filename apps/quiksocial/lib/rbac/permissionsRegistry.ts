/**
 * QuikSocial permission registry — single source of truth for the
 * QuikIT RBAC v2 layer that sits ON TOP of BrandMembership.
 *
 * Lives here (not in @quikit/shared) per the cross-app convention —
 * QuikScale and QuikTrack each own their own registry under
 * lib/api/permissionsRegistry.ts.
 *
 * Flat (resource, action) shape — no submodule tree. QuikSocial's surface
 * is narrower than QuikScale's OPSP/People/Analytics fan-out; one resource
 * per top-level domain is plenty for now. Add submodules later if/when a
 * matrix UI needs to render nested groups.
 */

export const ACTIONS = ["view", "create", "update", "delete"] as const;
export type Action = (typeof ACTIONS)[number];

export const RESOURCES = [
  "brand",
  "post",
  "campaign",
  "catalog",
  "auto-reply",
  "integrations",
  "settings",
] as const;
export type Resource = (typeof RESOURCES)[number];

const _resourceSet: Set<string> = new Set(RESOURCES);

export function isResource(s: string): s is Resource {
  return _resourceSet.has(s);
}

export function isAction(s: string): s is Action {
  return (ACTIONS as readonly string[]).includes(s);
}

/** Flat list of every (resource, action) pair — 7 × 4 = 28 entries. */
export function allPermissionPairs(): Array<{ resource: Resource; action: Action }> {
  const out: Array<{ resource: Resource; action: Action }> = [];
  for (const resource of RESOURCES) {
    for (const action of ACTIONS) {
      out.push({ resource, action });
    }
  }
  return out;
}

/**
 * Default grants for the "User" role — read-only on every resource. New
 * invitees who get assigned to the default role can see the surfaces but
 * cannot mutate; admins promote them to a custom role for write access.
 */
export const USER_DEFAULT_GRANTS: ReadonlyArray<{
  resource: Resource;
  action: Action;
}> = RESOURCES.map((resource) => ({ resource, action: "view" as Action }));
