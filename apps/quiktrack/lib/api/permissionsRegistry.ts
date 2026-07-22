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

/**
 * Name of the seeded full-access project role. Single source of truth (lives
 * here so both server and client code can import it without pulling in
 * server-only modules). A holder of this role has full access inside its space
 * — like an app admin scoped to the project — and its matrix is locked in the UI.
 */
export const SPACE_ADMIN_ROLE_NAME = "Space Admin";

/**
 * Name of the seeded "Space Creator" app-wide role — a Member who can also
 * create their own spaces (becoming Space Admin in each one). Lives here so
 * both server and client can reference it without server-only imports.
 */
export const SPACE_CREATOR_ROLE_NAME = "Space Creator";

/**
 * Seeded project roles that must NEVER be deleted (they back default access,
 * full-access, and read-only tiers). Project roles have no `isSystem` flag, so
 * protection is by name (plus the default role). Custom project roles are
 * still deletable.
 */
export const PROTECTED_PROJECT_ROLE_NAMES: readonly string[] = [
  SPACE_ADMIN_ROLE_NAME,
  "Contributor",
  "Viewer",
];

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
 * Every (resource, action) below is either enforced by `userCan` /
 * `userCanInProject` in the API layer OR consumed by a client-side
 * visibility gate (`useMyPermissions().has(...)`). Pairs with no consumer
 * are deliberately omitted so the matrix only surfaces controls that move
 * real bits — add a leaf/action here as soon as a new check lands.
 *
 * Real behaviour today:
 *   Project        — full CRUD via /api/projects[/:id]
 *   ProjectMember  — full CRUD: add (create) / list+settings (view) /
 *                    role+field+custom-field mgmt (update) / remove (delete)
 *   Sprint         — create + update via /api/sprints[/:id]. No view (sprints
 *                    are visible to members in the backlog, not gated) and no
 *                    delete (no sprint-delete enforcement).
 *   Issue          — create / update / delete via /api/issues[/:id]. No view:
 *                    issue visibility is membership-based, not gated by a grant.
 *   IssueComment   — create via /api/issues/:id/comments. No view (comments
 *                    show to anyone who can open the issue) and edit + delete
 *                    are AUTHOR-only (ownership) — so this leaf is create-only.
 *   ProjectViews   — view-only gates for the project tabs (route-gated in the
 *                    space layout): Summary / Timeline / Backlog / List /
 *                    Task Table / Board / Grouped Kanban. Visibility only —
 *                    actions inside a tab are gated by their own resource
 *                    (e.g. board card moves = Issue:update) or not at all
 *                    (grouped-kanban group management is open to any member).
 *   Doc            — full CRUD via docPermissions.userCanDoc(...)
 *   Timesheet      — create via /api/timesheets. Edit + delete are OWNER-only
 *                    (ownership check), not a grant — view/create only here.
 *   Report         — read-only reports module (client RequirePerm gate)
 */
export const PERMISSION_TREE: PermissionModule[] = [
  {
    key: "Spaces",
    label: "Spaces (Projects)",
    leaves: [
      { resource: "Project", label: "Project", actions: ACTIONS },
      { resource: "ProjectMember", label: "Project Member", actions: ACTIONS },
    ],
  },
  {
    key: "Sprints",
    label: "Sprints",
    leaves: [
      // No view (membership-based, not gated) and no delete (not enforced).
      { resource: "Sprint", label: "Sprint", actions: ["create", "update"] },
    ],
  },
  {
    key: "Issues",
    label: "Issues",
    leaves: [
      // No view: issue visibility is membership-based, not gated by Issue:view.
      { resource: "Issue", label: "Issue", actions: ["create", "update", "delete"] },
      // Create only: view isn't enforced; edit/delete are author-only (ownership).
      { resource: "IssueComment", label: "Comment", actions: ["create"] },
    ],
  },
  {
    key: "Discovery",
    label: "Product Discovery",
    leaves: [
      // Idea visibility is membership-based (not gated), matching Issue: no
      // `view`. Archive is an `update`; permanent delete is `delete` (Space
      // Admin only — Contributors get create/update but not delete).
      { resource: "Idea", label: "Idea", actions: ["create", "update", "delete"] },
      // `view` gates the discovery "Ideas" tab AND the view list. create/update/
      // delete manage saved views (a later phase ships >1 view type).
      { resource: "IdeaView", label: "Idea view", actions: ACTIONS },
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
      // View-only — these just gate tab visibility. Board card moves are
      // Issue:update, and grouped-kanban group management needs no permission
      // beyond project membership, so neither has an update grant.
      { resource: "Board", label: "Board", actions: ["view"] },
      { resource: "GroupedKanban", label: "Grouped Kanban", actions: ["view"] },
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
      // Edit/delete are owner-only (ownership), not grants — view/create only.
      { resource: "Timesheet", label: "Time Entry", actions: ["view", "create"] },
    ],
  },
  {
    key: "Reports",
    label: "Reports",
    leaves: [
      { resource: "Report", label: "Reports", actions: ["view"] },
    ],
  },
  // Page-level sidebar destinations with no CRUD of their own. Modelled as
  // view-only rows (like Reports) so a single `view` grant both gates the page
  // and surfaces its sidebar row via ENTITY_TO_NAV — no separate Navigation tab.
  {
    key: "Home",
    label: "Home",
    leaves: [
      { resource: "Home", label: "For you", actions: ["view"] },
    ],
  },
  {
    key: "Dashboards",
    label: "Dashboards",
    leaves: [
      { resource: "Dashboard", label: "Dashboards", actions: ["view"] },
    ],
  },
];

/* ───────────────────────── Scope split ───────────────────────── */

/**
 * Resources that only make sense at the APP-WIDE level — global sidebar
 * destinations / global pages with no project context. They appear on the
 * app-wide role matrix but NOT the per-space project matrix: a project role
 * governs what a user can do *inside a space*, and there's no single project
 * to scope a global feature to (one sidebar, many project roles). The override
 * model already gives project roles authority over everything in-space.
 */
export const APP_WIDE_ONLY_RESOURCES: ReadonlySet<string> = new Set([
  "Home",
  "Dashboard",
  "Report",
]);

export function isAppWideOnly(resource: string): boolean {
  return APP_WIDE_ONLY_RESOURCES.has(resource);
}

/**
 * PERMISSION_TREE filtered to project-scoped resources — what the per-space
 * project role matrix renders. App-wide-only leaves are dropped, and any module
 * left empty (Home / Dashboards / Reports) disappears entirely.
 */
export const PROJECT_PERMISSION_TREE: PermissionModule[] = PERMISSION_TREE
  .map((mod) => ({
    ...mod,
    leaves: mod.leaves?.filter((l) => !isAppWideOnly(l.resource)),
  }))
  .filter((mod) => (mod.leaves?.length ?? 0) > 0 || (mod.subModules?.length ?? 0) > 0);

/* ───────────────────────── Navigation registry ───────────────────────── */

/**
 * Pure-navigation entries — sidebar rows with no entity counterpart that must
 * be toggled explicitly via the `RoleNavigation` table.
 *
 * EMPTY today: every sidebar row now maps to an entity `view` grant (see
 * ENTITY_TO_NAV), so there is no separate Navigation tab — sidebar visibility
 * is managed entirely from the Entities matrix. Re-add an entry here only for
 * a future sidebar row that genuinely has no entity behind it.
 */
export const NAV_ITEMS: ReadonlyArray<{ key: string; label: string }> = [];

/**
 * Resource → navKey mapping. Granting a role `<entity>:view` is enough to
 * surface its sidebar row — no duplicate nav checkbox required.
 *
 * Drives both the server-side `userHasNav(...)` resolver and the client
 * `useMyPermissions().hasNav(...)` derivation.
 */
export const ENTITY_TO_NAV: Record<string, string> = {
  Home: "home",
  Dashboard: "dashboards",
  Project: "spaces",
  Timesheet: "timesheet",
  Report: "reports",
};

/**
 * One-time migration map: navKeys that USED to be pure-nav rows in
 * `QtRoleNavigation` and are now derived from an entity `view` grant. The
 * seeder (`backfillNavToView`) converts any legacy nav row for these keys into
 * the mapped `<entity>:view` grant so existing roles don't lose the sidebar row.
 */
export const LEGACY_NAV_TO_VIEW: Record<string, string> = {
  home: "Home",
  dashboards: "Dashboard",
};

/** Reverse lookup — derived from ENTITY_TO_NAV. */
export const NAV_TO_ENTITY: Record<string, string> = Object.fromEntries(
  Object.entries(ENTITY_TO_NAV).map(([entity, nav]) => [nav, entity]),
);

/** True when this navKey is purely nav (no entity to derive from). */
export function isNavOnly(navKey: string): boolean {
  return !(navKey in NAV_TO_ENTITY);
}

export type NavKey = string;
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
