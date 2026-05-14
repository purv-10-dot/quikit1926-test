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

export const PERMISSION_TREE: PermissionModule[] = [
  {
    key: "Home",
    label: "Home",
    leaves: [{ resource: "Home", label: "For you", actions: ["view"] }],
  },
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
      { resource: "IssueStatus", label: "Issue Status", actions: ACTIONS },
      { resource: "IssueType", label: "Issue Type", actions: ACTIONS },
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
    key: "Timesheets",
    label: "Timesheets",
    leaves: [
      { resource: "Timesheet", label: "Time Entry", actions: ACTIONS },
      { resource: "TimesheetWeekly", label: "Weekly Summary", actions: ["view"] },
    ],
  },
  {
    key: "Reports",
    label: "Reports",
    leaves: [
      { resource: "Report", label: "Reports", actions: ["view"] },
      { resource: "Report.TaskTime", label: "Task-Time Report", actions: ["view"] },
    ],
  },
  {
    key: "Dashboards",
    label: "Dashboards",
    leaves: [
      { resource: "Dashboard", label: "Dashboard", actions: ACTIONS },
    ],
  },
  {
    key: "Docs",
    label: "Docs",
    leaves: [
      { resource: "Doc", label: "Document", actions: ACTIONS },
      { resource: "Page", label: "Page", actions: ACTIONS },
    ],
  },
  {
    key: "Teams",
    label: "Teams",
    leaves: [
      { resource: "Team", label: "Team", actions: ACTIONS },
      { resource: "TeamMember", label: "Team Member", actions: ACTIONS },
    ],
  },
  {
    key: "OrgSetup",
    label: "Org Setup",
    leaves: [
      { resource: "User", label: "Users", actions: ACTIONS },
      { resource: "Invitation", label: "Invitations", actions: ACTIONS },
    ],
  },
  {
    key: "Feedback",
    label: "Feedback",
    leaves: [
      { resource: "Feedback", label: "Share Feedback", actions: ["create", "view"] },
    ],
  },
];

/* ───────────────────────── Navigation registry ───────────────────────── */

/**
 * Sidebar items the `RoleNavigation` table whitelists by key.
 * Each key corresponds to a nav row rendered in the quiktrack sidebar.
 */
export const NAV_ITEMS = [
  { key: "home", label: "For you" },
  { key: "spaces", label: "Spaces" },
  { key: "spaces.templates", label: "Space Templates" },
  { key: "issues", label: "Issues" },
  { key: "boards", label: "Boards" },
  { key: "timesheet", label: "Timesheet" },
  { key: "reports", label: "Reports" },
  { key: "dashboards", label: "Dashboards" },
  { key: "docs", label: "Docs" },
  { key: "plans", label: "Plans" },
  { key: "teams", label: "Teams" },
  { key: "orgSetup.users", label: "Users" },
  { key: "orgSetup.invitations", label: "Invitations" },
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]["key"];
export const NAV_KEYS: readonly string[] = NAV_ITEMS.map((n) => n.key);

/* ───────────────────────── Derived helpers ───────────────────────── */

/** Flat list of every (resource, action) tuple the tree declares. */
export function flattenPermissions(): Array<{ resource: string; action: Action }> {
  const out: Array<{ resource: string; action: Action }> = [];
  const walkSub = (sub: PermissionSubModule) => {
    for (const leaf of sub.leaves) {
      for (const action of leaf.actions) out.push({ resource: leaf.resource, action });
    }
    sub.subModules?.forEach(walkSub);
  };
  for (const mod of PERMISSION_TREE) {
    mod.leaves?.forEach((leaf) => {
      for (const action of leaf.actions) out.push({ resource: leaf.resource, action });
    });
    mod.subModules?.forEach(walkSub);
  }
  return out;
}

/** Set of every resource string declared anywhere in the tree. */
export const ALL_RESOURCES: ReadonlySet<string> = new Set(
  flattenPermissions().map((p) => p.resource),
);
