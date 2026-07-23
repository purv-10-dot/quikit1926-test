/**
 * Canonical project tab registry — single source of truth for the tab bar
 * (project-header.tsx), the route gate (space layout.tsx), and the API
 * validator (projects/[id] PATCH). Pure data + helpers only (client- and
 * server-safe — no React, no lucide, no server imports). Icons stay in the
 * header, keyed by `path`.
 *
 * Each tab carries the entity permission that gates it for a ROLE. On top of
 * that role gate, a project can curate which tabs appear via `QtProject.tabConfig`
 * (an ordered array of enabled paths; null = all tabs). A tab is visible only
 * when the role allows it AND the project has it enabled.
 */

export interface ProjectTab {
  /** URL segment under /spaces/[id]/<path>. */
  path: string;
  label: string;
  /** Entity perm that gates this tab for a role. null = always allowed. */
  perm: { resource: string; action: string } | null;
}

export const PROJECT_TABS: ProjectTab[] = [
  { path: "summary", label: "Summary", perm: { resource: "ProjectSummary", action: "view" } },
  { path: "timeline", label: "Timeline", perm: { resource: "ProjectTimeline", action: "view" } },
  { path: "backlog", label: "Backlog", perm: { resource: "ProjectBacklog", action: "view" } },
  { path: "epics", label: "Epics", perm: { resource: "ProjectBacklog", action: "view" } },
  { path: "board", label: "Board", perm: { resource: "Board", action: "view" } },
  { path: "grouped-kanban", label: "Grouped Kanban", perm: { resource: "GroupedKanban", action: "view" } },
  { path: "list", label: "List", perm: { resource: "ProjectList", action: "view" } },
  { path: "task-table", label: "Task Table", perm: { resource: "ProjectTaskTable", action: "view" } },
  { path: "reports", label: "Reports", perm: { resource: "ProjectReports", action: "view" } },
  { path: "timesheet", label: "Timesheet", perm: { resource: "Timesheet", action: "view" } },
  { path: "docs", label: "Docs", perm: { resource: "Doc", action: "view" } },
  // Product Discovery only — the "All ideas" surface. Excluded from the
  // "all tabs" default (see DISCOVERY_ONLY_TABS) so non-discovery spaces never
  // show it; discovery spaces provision with an explicit tabConfig of ["ideas"].
  { path: "ideas", label: "Ideas", perm: { resource: "IdeaView", action: "view" } },
];

/** Tabs that only make sense on a discovery space. Kept out of the default
 *  ("all tabs") set so a software/functional space never surfaces them. */
export const DISCOVERY_ONLY_TABS: ReadonlySet<string> = new Set(["ideas"]);

/** Every tab path except the discovery-only ones — the real "all tabs" default
 *  for a normal (software/functional) space. */
const DEFAULT_TAB_PATHS: string[] = PROJECT_TABS.filter(
  (t) => !DISCOVERY_ONLY_TABS.has(t.path),
).map((t) => t.path);

/** Ordered list of every known tab path. */
export const PROJECT_TAB_PATHS: string[] = PROJECT_TABS.map((t) => t.path);

/** Route segment → gating perm (used by the space layout's route guard). */
export const TAB_ROUTE_GATES: Record<string, { resource: string; action: string }> =
  Object.fromEntries(
    PROJECT_TABS.filter((t) => t.perm).map((t) => [t.path, t.perm!]),
  );

export function isProjectTabPath(p: string): boolean {
  return PROJECT_TAB_PATHS.includes(p);
}

/**
 * Normalize a stored tabConfig into the ordered list of enabled paths.
 * - null/undefined  → all tabs (default, unconfigured project)
 * - drops unknown paths (defensive against stale config after a tab is removed)
 * - empty after filtering → all tabs (never leave a project with no tabs)
 */
export function enabledTabPaths(config: string[] | null | undefined): string[] {
  if (!config) return DEFAULT_TAB_PATHS;
  const known = config.filter(isProjectTabPath);
  return known.length > 0 ? known : DEFAULT_TAB_PATHS;
}

/** True when `path` is enabled for the project under the given config. */
export function isTabEnabled(config: string[] | null | undefined, path: string): boolean {
  return enabledTabPaths(config).includes(path);
}

/** Validate an incoming tabConfig: ≥1 entry, all known paths, no duplicates. */
export function isValidTabConfig(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  if (value.length < 1) return false;
  const seen = new Set<string>();
  for (const v of value) {
    if (typeof v !== "string" || !isProjectTabPath(v) || seen.has(v)) return false;
    seen.add(v);
  }
  return true;
}
