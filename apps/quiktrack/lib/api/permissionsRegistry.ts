/**
 * Local permission tree registry — single source of truth for the
 * QuikTrack Roles & Permissions v2 system.
 *
 * Mirrors apps/quikscale/lib/api/permissionsRegistry.ts so the admin
 * UI can render quiktrack's permission matrix the same way it renders
 * quikscale's.
 *
 * Lives here (not in `@quikit/shared`) — per-app registries keep
 * resource semantics local to the app that owns them.
 *
 * Shape:
 *   PERMISSION_TREE → Module[] → SubModule[] → leaves[{ resource, label, actions }]
 *
 * Add a new module/leaf here and the Manage Permission UI re-renders
 * automatically. Resource keys are dot-namespaced so the tree maps
 * onto a flat `RolePermission(resource, action)` storage table.
 */

/* ───────────────────────── Action vocabulary ───────────────────────── */

export const ACTIONS = ["view", "create", "update", "delete"] as const;
export type Action = (typeof ACTIONS)[number];

/* ───────────────────────── Tree types ───────────────────────── */

export interface PermissionLeaf {
  resource: string;
  label: string;
  actions: readonly Action[];
}

export interface PermissionSubModule {
  key: string;
  label: string;
  leaves: PermissionLeaf[];
  subModules?: PermissionSubModule[];
}

export interface PermissionModule {
  key: string;
  label: string;
  leaves?: PermissionLeaf[];
  subModules?: PermissionSubModule[];
}

/* ───────────────────────── The tree ───────────────────────── */

/**
 * Resources listed below are the ones actually enforced by `userCan` /
 * `userCanInProject` in the API layer. Speculative entities (Docs, Teams,
 * Dashboards, Feedback, …) were removed so the matrix UI only surfaces
 * controls that move real bits. Add a row here as soon as a new
 * `userCan(...)` check lands in the codebase.
 *
 * Real enforcement today:
 *   Project        — POST/PATCH/DELETE /api/projects[/:id]
 *   ProjectMember  — POST/PATCH/DELETE /api/projects/:id/members  (Layer 2 plan)
 *   Sprint         — POST/PATCH/DELETE /api/sprints[/:id]
 *   Issue          — POST/PATCH/DELETE /api/issues[/:id]
 *   IssueComment   — POST/PATCH/DELETE /api/issues/:id/comments  (project-role seed)
 *   Board          — view/update only (kanban state changes)
 *   Timesheet      — POST /api/timesheets
 *   Report         — read-only reports module
 */
export const PERMISSION_TREE: PermissionModule[] = [
  {
    key: "Spaces",
    label: "Spaces (Projects)",
    leaves: [
      { resource: "Project", label: "Project", actions: ACTIONS },
      { resource: "ProjectMember", label: "Project Member", actions: ACTIONS },
      { resource: "Sprint", label: "Sprint", actions: ACTIONS },
    ],
  },
  {
    key: "Issues",
    label: "Issues",
    leaves: [
      { resource: "Issue", label: "Issue", actions: ACTIONS },
      { resource: "IssueComment", label: "Comment", actions: ACTIONS },
    ],
  },
  {
    key: "Boards",
    label: "Boards",
    leaves: [
      { resource: "Board", label: "Board", actions: ["view", "update"] },
    ],
  },
  {
    key: "ProjectViews",
    label: "Project views",
    leaves: [
      { resource: "ProjectSummary", label: "Summary tab", actions: ["view"] },
      { resource: "ProjectTimeline", label: "Timeline tab", actions: ["view"] },
      { resource: "ProjectBacklog", label: "Backlog tab", actions: ["view"] },
      { resource: "ProjectList", label: "List tab", actions: ["view"] },
      { resource: "ProjectTaskTable", label: "Task Table tab", actions: ["view"] },
    ],
  },
  {
    key: "Docs",
    label: "Docs",
    leaves: [
      { resource: "Doc", label: "Document", actions: ACTIONS },
    ],
  },
  {
    key: "Timesheets",
    label: "Timesheets",
    leaves: [
      { resource: "Timesheet", label: "Time Entry", actions: ACTIONS },
    ],
  },
  {
    key: "Reports",
    label: "Reports",
    leaves: [
      { resource: "Report", label: "Reports", actions: ["view"] },
    ],
  },
];

/* ───────────────────────── Navigation registry ───────────────────────── */

/**
 * Sidebar items the `RoleNavigation` table whitelists by key.
 * Each key corresponds to a nav row rendered in the quiktrack sidebar.
 */
// Pure-navigation entries — sidebar rows that have no entity counterpart in
// the permission tree (no CRUD surface; their nav row IS the feature). For
// nav items that *do* have an entity (Spaces / Timesheet / Reports / …),
// visibility is derived automatically from the role's `view` grant via
// ENTITY_TO_NAV below — no separate toggle needed.
export const NAV_ITEMS = [
  { key: "home", label: "For you" },
  { key: "dashboards", label: "Dashboards" },
  { key: "plans", label: "Plans" },
] as const;

/**
 * Resource → navKey mapping. Granting a role `<entity>:view` is enough to
 * surface its sidebar row — no duplicate nav checkbox required.
 *
 * Drives both the server-side `userHasNav(...)` resolver and the client
 * `useMyPermissions().hasNav(...)` derivation.
 */
export const ENTITY_TO_NAV: Record<string, string> = {
  Project: "spaces",
  Timesheet: "timesheet",
  Report: "reports",
};

/** Reverse lookup — derived from ENTITY_TO_NAV. */
export const NAV_TO_ENTITY: Record<string, string> = Object.fromEntries(
  Object.entries(ENTITY_TO_NAV).map(([entity, nav]) => [nav, entity]),
);

/** True when this navKey is purely nav (no entity to derive from). */
export function isNavOnly(navKey: string): boolean {
  return !(navKey in NAV_TO_ENTITY);
}

export type NavKey = (typeof NAV_ITEMS)[number]["key"];
export const NAV_KEYS: readonly string[] = NAV_ITEMS.map((n) => n.key);

/* ───────────────────────── Derived helpers ───────────────────────── */

/** Walk every leaf in the tree once. */
export function* walkLeaves(): Generator<PermissionLeaf> {
  function* walkSubs(subs: readonly PermissionSubModule[]): Generator<PermissionLeaf> {
    for (const sub of subs) {
      for (const leaf of sub.leaves) yield leaf;
      if (sub.subModules) yield* walkSubs(sub.subModules);
    }
  }
  for (const mod of PERMISSION_TREE) {
    if (mod.leaves) for (const leaf of mod.leaves) yield leaf;
    if (mod.subModules) yield* walkSubs(mod.subModules);
  }
}

/** Flat list of every (resource, action) tuple the tree declares. */
export function flattenPermissions(): Array<{ resource: string; action: Action }> {
  const out: Array<{ resource: string; action: Action }> = [];
  for (const leaf of walkLeaves()) {
    for (const action of leaf.actions) out.push({ resource: leaf.resource, action });
  }
  return out;
}

/** Alias used by the seeders and matrix UI — same data as `flattenPermissions`. */
export const allPermissionPairs = flattenPermissions;

/** Set of every resource string declared anywhere in the tree. */
const _resourceSet: Set<string> = (() => {
  const s = new Set<string>();
  for (const leaf of walkLeaves()) s.add(leaf.resource);
  return s;
})();

export const ALL_RESOURCES: ReadonlySet<string> = _resourceSet;
export const RESOURCES: readonly string[] = Array.from(_resourceSet);

export type Resource = string;

/** True when `s` is a known resource in the tree. */
export function isResource(s: string): s is Resource {
  return _resourceSet.has(s);
}

/** True when `s` is one of the four action verbs. */
export function isAction(s: string): s is Action {
  return (ACTIONS as readonly string[]).includes(s);
}

/** True when `s` is a known nav key. */
export function isNavKey(s: string): boolean {
  return NAV_KEYS.includes(s);
}

/**
 * True when `(resource, action)` is a VALID pair per the registry — leaf
 * exists AND lists `action` in its `actions` array. The matrix PUT endpoint
 * uses this to reject garbage pairs (e.g. `Board:create` — Board only allows
 * `view`/`update`).
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

/* ───────────────────────── Legacy resource mapping ───────────────────────── */

/**
 * Empty for QuikTrack today — kept for parity with QuikScale's seeder API so
 * `backfillLegacyResources` can no-op cleanly. Populate when/if a resource
 * key gets renamed in the future.
 */
export const LEGACY_RESOURCE_BACKFILL: Record<string, string[]> = {};
