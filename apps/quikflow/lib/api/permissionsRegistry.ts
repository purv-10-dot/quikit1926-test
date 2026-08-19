/**
 * Local permission tree registry — single source of truth for the QuikFlow
 * Roles & Permissions v2 system.
 *
 * Mirrors apps/quikscale/lib/api/permissionsRegistry.ts, trimmed to what
 * QuikFlow needs: no FF-1 feature-flag cascade (QuikFlow has no module-flag
 * system yet), no sub-sub-permission nesting.
 *
 * Shape:
 *   PERMISSION_TREE → Module[] → leaves[{ resource, label, actions }]
 *
 * Resource keys are dot-namespaced so the tree maps onto a flat
 * `RolePermission(resource, action)` storage table. The tree only exists in
 * code — the DB never sees the hierarchy.
 *
 * Add a new module/leaf here and the Roles & Permissions matrix in Settings
 * re-renders automatically.
 */

/* ───────────────────────── Action vocabulary ───────────────────────── */

export const ACTIONS = ["view", "create", "update", "delete"] as const;
export type Action = (typeof ACTIONS)[number];

/* ───────────────────────── Tree types ───────────────────────── */

export interface PermissionLeaf {
  /** Stable identifier stored in `RolePermission.resource`. Dot-namespaced. */
  resource: string;
  /** Human-readable label rendered in the matrix. */
  label: string;
  /** Which actions are valid for this leaf. Usually `ACTIONS`, but a leaf may
   * declare a subset (e.g. `Approvals` only needs view/update). */
  actions: readonly Action[];
}

export interface PermissionModule {
  key: string;
  label: string;
  leaves: PermissionLeaf[];
}

/* ───────────────────────── The tree ───────────────────────── */

export const PERMISSION_TREE: PermissionModule[] = [
  {
    key: "Dashboard",
    label: "Dashboard",
    leaves: [{ resource: "Dashboard", label: "Dashboard", actions: ["view"] }],
  },
  {
    key: "Workflows",
    label: "Workflows",
    leaves: [
      // Org-wide (scope=org) workflow authoring/management. A member's own
      // personal (scope=personal) workflows remain theirs regardless of
      // this grant — that instance-level check lives in the route handlers
      // (see ctx.isAdmin / ownerId comparisons), not in RBAC.
      { resource: "Workflows", label: "Workflows", actions: ACTIONS },
    ],
  },
  {
    key: "Templates",
    label: "Templates",
    leaves: [{ resource: "Templates", label: "Templates", actions: ACTIONS }],
  },
  {
    key: "Runs",
    label: "Run History",
    leaves: [
      // `update` covers the "Retry" action on a failed run/dead-letter job.
      { resource: "Runs", label: "Run History", actions: ["view", "update"] },
    ],
  },
  {
    key: "Insights",
    label: "Insights",
    leaves: [{ resource: "Insights", label: "Insights", actions: ["view"] }],
  },
  {
    key: "Approvals",
    label: "Approvals",
    leaves: [
      // `update` covers approve/reject; approvals are never created or
      // deleted through the UI (they're raised by a workflow step).
      { resource: "Approvals", label: "Approvals", actions: ["view", "update"] },
    ],
  },
  {
    key: "Connections",
    label: "Connections",
    leaves: [{ resource: "Connections", label: "Connections", actions: ACTIONS }],
  },
  {
    key: "OrgSetup",
    label: "Org Setup",
    leaves: [
      { resource: "Settings", label: "Settings", actions: ["view", "update"] },
      { resource: "Role", label: "Roles & Permissions", actions: ACTIONS },
    ],
  },
];

/* ───────────────────────── Sidebar → resource mapping ───────────────────────── */

/**
 * Sidebar visibility is derived from entity `view` grants. Each nav item's
 * href (see `components/dashboard/dashboard-shell.tsx`) maps to a single
 * resource here — the item is visible iff the user has `view` on it.
 */
export const NAV_RESOURCE: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/workflows": "Workflows",
  "/templates": "Templates",
  "/runs": "Runs",
  "/insights": "Insights",
  "/approvals": "Approvals",
  "/connections": "Connections",
  "/settings": "Settings",
};

/* ───────────────────────── Derived helpers ───────────────────────── */

/** Walk every leaf in the tree once. */
export function* walkLeaves(): Generator<PermissionLeaf> {
  for (const mod of PERMISSION_TREE) {
    for (const leaf of mod.leaves) yield leaf;
  }
}

/** Flat list of every (resource, action) pair the tree allows. */
export function allPermissionPairs(): Array<{ resource: string; action: Action }> {
  const out: Array<{ resource: string; action: Action }> = [];
  for (const leaf of walkLeaves()) {
    for (const action of leaf.actions) out.push({ resource: leaf.resource, action });
  }
  return out;
}

/** Set of every resource key the tree exposes. Built once, lazy. */
const _resourceSet: Set<string> = (() => {
  const s = new Set<string>();
  for (const leaf of walkLeaves()) s.add(leaf.resource);
  return s;
})();

export const RESOURCES: readonly string[] = Array.from(_resourceSet);

/** Resource is intentionally a `string` alias — keys are open-ended dot paths. */
export type Resource = string;

/** True when `s` is a known resource in the tree. */
export function isResource(s: string): s is Resource {
  return _resourceSet.has(s);
}

/** True when `s` is one of the four action verbs. */
export function isAction(s: string): s is Action {
  return (ACTIONS as readonly string[]).includes(s);
}

/**
 * True when `(resource, action)` is a VALID pair per the registry — i.e. the
 * leaf exists AND lists this action in its `actions` array.
 *
 * The role permissions PUT endpoint uses this to reject garbage like
 * `(resource: "Approvals", action: "delete")` (the leaf only declares
 * `["view", "update"]`).
 */
export function isValidPermissionPair(resource: string, action: string): boolean {
  if (!isAction(action)) return false;
  for (const leaf of walkLeaves()) {
    if (leaf.resource === resource) {
      return (leaf.actions as readonly string[]).includes(action);
    }
  }
  return false;
}
