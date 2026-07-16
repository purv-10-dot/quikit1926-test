/**
 * Local permission-tree registry — single source of truth for QuikChat's
 * Roles & Permissions v2 system (docs/RBAC_PLAN.md §4).
 *
 * Mirrors the QuikScale registry pattern: the hierarchy lives ONLY in code
 * (modules → leaves), while the DB stores a flat `(resource, action)` pair
 * per `QcRolePermission` row. The tree drives the future admin matrix UI
 * (Phase 3) and validates writes; the DB never sees the hierarchy.
 *
 * Resource keys are dot-namespaced so a leaf like `Channel.Public` maps onto
 * the flat storage table. Add a leaf here and every derived helper (seeders,
 * validators, the eventual matrix) picks it up automatically.
 */

/* ───────────────────────── Action vocabulary ───────────────────────── */

export const ACTIONS = ["view", "create", "update", "delete"] as const;
export type Action = (typeof ACTIONS)[number];

/* ───────────────────────── Tree types ───────────────────────── */

export interface PermissionLeaf {
  /** Stable identifier stored in `QcRolePermission.resource`. Dot-namespaced. */
  resource: string;
  /** Human-readable label rendered in the matrix. */
  label: string;
  /**
   * Which actions are valid for this leaf. Binary leaves (e.g.
   * `Channel.Public` → `["create"]`) declare a single action so the UI
   * renders one checkbox and the server rejects garbage pairs.
   */
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
    key: "Channel",
    label: "Channels",
    leaves: [
      { resource: "Channel", label: "Channels", actions: ACTIONS },
      // DECISION 2 — org_admin decides who may create public channels
      // (default Member OFF). Matrix cell.
      { resource: "Channel.Public", label: "Create Public Channel", actions: ["create"] },
      { resource: "Channel.DM", label: "Start Direct Message", actions: ["create"] },
      // DECISION 4 — org_admin decides moderation (default Moderator + Admin).
      { resource: "Channel.Moderate", label: "Moderate Channel", actions: ["update", "delete"] },
      { resource: "Channel.InviteExternal", label: "Invite External Guest", actions: ["create"] },
    ],
  },
  {
    key: "Call",
    label: "Calls",
    leaves: [
      { resource: "Call", label: "Start Call", actions: ["create"] },
      { resource: "Call.Group", label: "Start Group Call", actions: ["create"] },
    ],
  },
  {
    key: "Assistant",
    label: "AI Assistant",
    leaves: [
      { resource: "Assistant", label: "Use Assistant", actions: ["view", "create"] },
      {
        resource: "Assistant.IngestPrivate",
        label: "Ingest to Private KB",
        actions: ["create"],
      },
      // DECISION 3 — org-wide knowledge-base ingest is Admin only.
      { resource: "Assistant.IngestOrg", label: "Ingest to Org KB", actions: ["create"] },
      { resource: "Assistant.Configure", label: "Configure Assistant", actions: ["update"] },
    ],
  },
  {
    key: "App",
    label: "App Settings",
    leaves: [
      // Admin-only: toggle app feature modules (Phase 3 AppModuleFlag).
      { resource: "App.Modules", label: "Manage Modules", actions: ["update"] },
    ],
  },
];

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
 * leaf exists AND lists this action in its `actions` array. The Phase-3
 * matrix PUT endpoint will use this to reject garbage like
 * `(resource: "Channel.Public", action: "delete")`.
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
