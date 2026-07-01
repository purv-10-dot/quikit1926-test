/**
 * Local permission tree registry — single source of truth for the
 * QuikScale Roles & Permissions v2 system.
 *
 * Lives here (not in `@quikit/shared`) because the user has scoped
 * out-of-scope edits under `packages/shared/**`. The legacy shared
 * `permissionsRegistry.ts` referenced in old docs was never written.
 *
 * Shape:
 *   PERMISSION_TREE → Module[] → SubModule[] → leaves[{ resource, label, actions }]
 *
 * Resource keys are dot-namespaced so the tree maps onto a flat
 * `RolePermission(resource, action)` storage table. The Tree only
 * exists in code — the DB never sees the hierarchy.
 *
 * Add a new module/leaf here, run `prisma generate` if you also added
 * any DB-backed concept, and the Manage Permission UI re-renders
 * automatically.
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
  /**
   * Which actions are valid for this leaf. Usually `ACTIONS` (full CRUD-V),
   * but binary leaves like `OPSP.History.EditFinalize` declare `["update"]`
   * so the UI only renders one checkbox and the server rejects garbage pairs.
   */
  actions: readonly Action[];
}

export interface PermissionSubModule {
  key: string;
  label: string;
  leaves: PermissionLeaf[];
  /**
   * Optional deeper nesting — used by `OPSP.History` whose child
   * `EditFinalize` is a sub-sub-permission inside the History submodule.
   */
  subModules?: PermissionSubModule[];
}

export interface PermissionModule {
  key: string;
  label: string;
  /** Direct leaves when the module has no submodules (typical case). */
  leaves?: PermissionLeaf[];
  /** Subtree when the module fans out (e.g. OPSP → Create / History / Review / Categories). */
  subModules?: PermissionSubModule[];
}

/* ───────────────────────── The tree ───────────────────────── */

export const PERMISSION_TREE: PermissionModule[] = [
  {
    key: "Dashboard",
    label: "Dashboard",
    leaves: [{ resource: "Dashboard", label: "Dashboard", actions: ["view"] }],
  },
  {
    key: "KPI",
    label: "KPI",
    leaves: [
      { resource: "KPI", label: "Individual KPI", actions: ACTIONS },
      { resource: "TeamKPI", label: "Team KPI", actions: ACTIONS },
    ],
  },
  {
    key: "Priority",
    label: "Priority",
    leaves: [{ resource: "Priority", label: "Priority", actions: ACTIONS }],
  },
  {
    key: "OrgSetup",
    label: "Org Setup",
    leaves: [
      { resource: "Team", label: "Teams", actions: ACTIONS },
      { resource: "Quarter", label: "Quarter Settings", actions: ACTIONS },
      { resource: "Unit", label: "Unit Master", actions: ACTIONS },
    ],
    // `User` is a SubModule (not a flat leaf) so it can host UI-only
    // sub-permissions for the Add User button and the User Management tab —
    // mirrors the OPSP.History → EditFinalize nesting pattern.
    subModules: [
      {
        key: "User",
        label: "Users",
        leaves: [
          { resource: "User", label: "Users", actions: ACTIONS },
        ],
        subModules: [
          {
            // UI-only: gates the "Add User" button on the Users tab. Server
            // still enforces `User.create` on POST /api/org/users, so this
            // sub-permission can hide the affordance without weakening the
            // API. Action is `create` (the button triggers a create flow).
            key: "User.AddUser",
            label: "Add User Button",
            leaves: [
              { resource: "User.AddUser", label: "Add User Button", actions: ["create"] },
            ],
          },
          {
            // UI-only: gates visibility of the "User Management" tab in the
            // page navigation. Inside the tab, role-mgmt actions still gate
            // on the `Role` resource (server- and UI-side).
            key: "User.Management",
            label: "User Management Tab",
            leaves: [
              { resource: "User.Management", label: "User Management Tab", actions: ["view"] },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "WWW",
    label: "WWW",
    leaves: [{ resource: "WWW", label: "WWW", actions: ACTIONS }],
  },
  {
    key: "ClientMeetings",
    label: "Meeting Rhythm",
    leaves: [
      { resource: "ClientMeetings.Dashboard", label: "Meeting Dashboard", actions: ["view"] },
      { resource: "ClientMaster", label: "Client Master", actions: ACTIONS },
      { resource: "ClientMember", label: "Client Members", actions: ACTIONS },
      { resource: "DailyHuddle", label: "Daily Huddle", actions: ACTIONS },
      { resource: "WeeklyMeeting", label: "Weekly Meeting", actions: ACTIONS },
    ],
  },
  {
    key: "OPSP",
    label: "OPSP",
    subModules: [
      {
        key: "OPSP.Create",
        label: "Create OPSP",
        leaves: [{ resource: "OPSP.Create", label: "Create OPSP", actions: ACTIONS }],
      },
      {
        key: "OPSP.History",
        label: "OPSP History",
        leaves: [{ resource: "OPSP.History", label: "OPSP History", actions: ACTIONS }],
        // Sub-sub permission: gates the Edit button on the History page
        // (and the editor lock) for OPSPs whose status is finalized/reviewed.
        subModules: [
          {
            key: "OPSP.History.EditFinalize",
            label: "Edit after Finalize",
            leaves: [
              {
                resource: "OPSP.History.EditFinalize",
                label: "Edit after Finalize",
                actions: ["update"],
              },
            ],
          },
        ],
      },
      {
        key: "OPSP.Review",
        label: "OPSP Review",
        leaves: [{ resource: "OPSP.Review", label: "OPSP Review", actions: ACTIONS }],
      },
      {
        // Standalone leaf (NOT nested under OPSP Review) — gates the
        // "Critical # Review" sub-feature. Default-granted as `view` to admin +
        // member (see memberDefaults); full CRUD so an admin can additionally
        // grant update (enter Achieved/Comment) / create / delete via the matrix.
        key: "OPSP.Review.Critical",
        label: "Critical Review",
        leaves: [
          {
            resource: "OPSP.Review.Critical",
            label: "Critical Review",
            actions: ACTIONS,
          },
        ],
      },
      {
        key: "OPSP.Categories",
        label: "Category Mgmt",
        leaves: [{ resource: "OPSP.Categories", label: "Category Mgmt", actions: ACTIONS }],
      },
      {
        // Special permission: lets an admin pick another user on Create OPSP
        // and edit THAT user's per-user sections (Your Accountability /
        // Quarterly Priorities / Critical # / Balanced Critical #). Default
        // OFF for everyone — admins must opt in (see ADMIN_DEFAULT_EXCLUSIONS).
        key: "OPSP.EditUser",
        label: "Edit Any User's OPSP",
        leaves: [
          {
            resource: "OPSP.EditUser",
            label: "Edit Any User's OPSP",
            actions: ["update"],
          },
        ],
      },
    ],
  },
  {
    key: "Analytics",
    label: "Analytics",
    leaves: [
      { resource: "Analytics.Scorecard", label: "Scorecard", actions: ["view"] },
      { resource: "Analytics.Individual", label: "Individual", actions: ["view"] },
      { resource: "Analytics.Teams", label: "Teams", actions: ["view"] },
      { resource: "Analytics.Trends", label: "Trends", actions: ["view"] },
    ],
  },
  {
    key: "People",
    label: "People",
    leaves: [
      { resource: "People.Cycle", label: "Cycle", actions: ACTIONS },
      { resource: "People.Goals", label: "Goals", actions: ACTIONS },
      { resource: "People.Self", label: "Self-Assessment", actions: ACTIONS },
      { resource: "People.Reviews", label: "Reviews", actions: ACTIONS },
      { resource: "People.OneOnOne", label: "1:1s", actions: ACTIONS },
      { resource: "People.Feedback", label: "Feedback", actions: ACTIONS },
      { resource: "People.Talent", label: "Talent", actions: ACTIONS },
    ],
  },
  {
    key: "Habits",
    label: "Habits",
    leaves: [{ resource: "Habits", label: "Rockefeller Habits", actions: ACTIONS }],
  },
  {
    key: "FACe",
    label: "FACe",
    leaves: [{ resource: "FACe", label: "Function Accountability Chart", actions: ACTIONS }],
  },
  {
    key: "PACe",
    label: "PACe",
    leaves: [{ resource: "PACe", label: "Process Accountability Chart", actions: ACTIONS }],
  },
  {
    key: "SWT",
    label: "SWT",
    leaves: [{ resource: "SWT", label: "Strengths, Weaknesses & Trends", actions: ACTIONS }],
  },
  {
    key: "Survey",
    label: "NPS Surveys",
    leaves: [
      { resource: "Survey", label: "Surveys", actions: ACTIONS },
      { resource: "Survey.Responses", label: "Survey Responses", actions: ["view", "create"] },
    ],
  },
];

/* ───────────────────────── Sidebar → resource mapping ───────────────────────── */

/**
 * Sidebar visibility is derived from entity `view` grants. Each sidebar leaf's
 * `moduleKey` (defined in `components/dashboard/sidebar.tsx`) maps to a single
 * resource here — the sidebar item is visible iff the user has `view` on it.
 *
 * Keep keys in sync with the `moduleKey` strings in the sidebar navigation
 * constant. A `moduleKey` without a mapping here falls back to feature-flag
 * gating only (see `filterNavigation`).
 */
export const NAV_RESOURCE: Record<string, string> = {
  dashboard: "Dashboard",
  "kpi.individual": "KPI",
  "kpi.teams": "TeamKPI",
  priority: "Priority",
  "orgSetup.teams": "Team",
  "orgSetup.users": "User",
  "orgSetup.quarters": "Quarter",
  "orgSetup.units": "Unit",
  www: "WWW",
  "clientMeetings.dashboard": "ClientMeetings.Dashboard",
  "clientMeetings.clients": "ClientMaster",
  "clientMeetings.members": "ClientMember",
  "clientMeetings.dailyHuddle": "DailyHuddle",
  "clientMeetings.weeklyMeeting": "WeeklyMeeting",
  "opsp.create": "OPSP.Create",
  "opsp.history": "OPSP.History",
  "opsp.review": "OPSP.Review",
  // The OPSP Review sidebar item is visible to Critical-Review-only users too
  // (it relabels to "Critical Review"); this maps that fallback resource.
  "opsp.review.critical": "OPSP.Review.Critical",
  "opsp.categories": "OPSP.Categories",
  "analytics.scorecard": "Analytics.Scorecard",
  "analytics.individual": "Analytics.Individual",
  "analytics.teams": "Analytics.Teams",
  "analytics.trends": "Analytics.Trends",
  "people.cycle": "People.Cycle",
  "people.goals": "People.Goals",
  "people.self": "People.Self",
  "people.reviews": "People.Reviews",
  "people.oneOnOne": "People.OneOnOne",
  "people.feedback": "People.Feedback",
  "people.talent": "People.Talent",
  habits: "Habits",
  face: "FACe",
  pace: "PACe",
  swt: "SWT",
  survey: "Survey",
};

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

/* ───────────────────── Feature-flag → permission tree ───────────────────── */

/**
 * Reverse of `NAV_RESOURCE`. Maps a permission-leaf resource ("TeamKPI") to
 * the feature-flag moduleKey ("kpi.teams") so the permission matrix can hide
 * leaves whose module the Super Admin has disabled for the tenant.
 *
 * Built once at module-load. Stable as long as NAV_RESOURCE is — every
 * sidebar-mapped resource appears here; resources without a sidebar (e.g.
 * sub-sub-permissions like `User.AddUser`, `OPSP.History.EditFinalize`)
 * inherit their parent's flag via TREE_MODULE_FLAG_KEY below.
 */
export const RESOURCE_TO_MODULE_KEY: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  for (const [moduleKey, resource] of Object.entries(NAV_RESOURCE)) {
    out[resource] = moduleKey;
  }
  return out;
})();

/**
 * PermissionTree module-level key ("KPI", "OrgSetup", …) → feature-flag
 * moduleKey ("kpi", "orgSetup", …). The tree uses PascalCase headings; the
 * Super Admin feature-flag system uses lowercase dot-namespaced keys.
 */
export const TREE_MODULE_FLAG_KEY: Readonly<Record<string, string>> = {
  Dashboard: "dashboard",
  KPI: "kpi",
  Priority: "priority",
  OrgSetup: "orgSetup",
  WWW: "www",
  ClientMeetings: "clientMeetings",
  OPSP: "opsp",
  Analytics: "analytics",
  People: "people",
};

/**
 * Filter the permission tree to only modules/leaves the tenant has enabled.
 *
 * Rules:
 *   - A module/leaf is hidden when its own moduleKey OR any ancestor moduleKey
 *     is in the `disabled` set (the cascade is handled by `isModuleEnabled`).
 *   - Leaves with no moduleKey mapping (e.g. user-extra-only resources)
 *     inherit their parent module's flag.
 *   - Sub-modules without a moduleKey mapping inherit their parent too.
 *   - A module with all leaves AND all sub-modules hidden is removed entirely.
 *
 * Pure / side-effect-free. Safe to call inside a render.
 */
export function filterTreeByEnabledModules(
  tree: readonly PermissionModule[],
  disabled: Set<string>,
  isModuleEnabled: (moduleKey: string, disabled: Set<string>) => boolean,
): PermissionModule[] {
  const isLeafEnabled = (leaf: PermissionLeaf, parentFlagKey: string | undefined): boolean => {
    const flagKey = RESOURCE_TO_MODULE_KEY[leaf.resource] ?? parentFlagKey;
    if (!flagKey) return true;
    return isModuleEnabled(flagKey, disabled);
  };

  const filterSubModule = (
    sub: PermissionSubModule,
    parentFlagKey: string | undefined,
  ): PermissionSubModule | null => {
    // A sub-module's flag key is its own (if any leaf or itself maps), else
    // it inherits from the parent module. Sub-sub-permissions like
    // `User.AddUser` resolve via the parent `User` leaf's moduleKey.
    const ownFlagKey =
      RESOURCE_TO_MODULE_KEY[sub.leaves[0]?.resource ?? ""] ?? parentFlagKey;
    if (ownFlagKey && !isModuleEnabled(ownFlagKey, disabled)) return null;
    const leaves = sub.leaves.filter((l) => isLeafEnabled(l, ownFlagKey));
    const subModules = (sub.subModules ?? [])
      .map((s) => filterSubModule(s, ownFlagKey))
      .filter((s): s is PermissionSubModule => s !== null);
    if (leaves.length === 0 && subModules.length === 0) return null;
    return { ...sub, leaves, subModules: subModules.length ? subModules : sub.subModules };
  };

  return tree
    .map((mod): PermissionModule | null => {
      const flagKey = TREE_MODULE_FLAG_KEY[mod.key];
      if (flagKey && !isModuleEnabled(flagKey, disabled)) return null;
      const leaves = (mod.leaves ?? []).filter((l) => isLeafEnabled(l, flagKey));
      const subModules = (mod.subModules ?? [])
        .map((s) => filterSubModule(s, flagKey))
        .filter((s): s is PermissionSubModule => s !== null);
      if (leaves.length === 0 && subModules.length === 0) return null;
      return { ...mod, leaves, subModules };
    })
    .filter((m): m is PermissionModule => m !== null);
}

/** True when `s` is one of the four action verbs. */
export function isAction(s: string): s is Action {
  return (ACTIONS as readonly string[]).includes(s);
}

/**
 * True when `(resource, action)` is a VALID pair per the registry — i.e.
 * the leaf exists AND lists this action in its `actions` array.
 *
 * The Manage Permission PUT endpoint uses this to reject garbage like
 * `(resource: "OPSP.History.EditFinalize", action: "delete")` (the leaf
 * only declares `["update"]`).
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
 * Pre-v2 RolePermission rows used a flat `OPSP` resource for everything
 * under the OPSP module. The v2 tree splits that into 4 submodules.
 *
 * This map drives the one-time backfill in `seedAdminAppRole.ts`:
 * for every row with a legacy key, we insert equivalent rows for the
 * new dot-namespaced resources and then delete the legacy row.
 */
export const LEGACY_RESOURCE_BACKFILL: Record<string, string[]> = {
  OPSP: ["OPSP.Create", "OPSP.History", "OPSP.Review", "OPSP.Categories"],
  // Old "Individual" resource → new "KPI"
  Individual: ["KPI"],
};
