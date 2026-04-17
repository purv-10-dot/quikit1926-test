/**
 * Module registry — single source of truth for every app's module tree.
 *
 * Used by:
 *   - Super admin "App Feature Flags" UI to render the toggle tree.
 *   - Each app's sidebar to filter which modules/sub-modules render.
 *   - `packages/auth/feature-gate` to check which routes should 404/redirect.
 *
 * Keys are dot-delimited: parent `"kpi"`, child `"kpi.teams"`. The dot-based
 * hierarchy is used by the cascade rule in `isModuleEnabled`: a module renders
 * only if it AND every ancestor are enabled.
 *
 * Icons are referenced by string name (Lucide icon component name). Sidebar
 * renderers resolve the string to a component. Keeps this package
 * client-safe (no React/lucide imports).
 *
 * See docs/plans/FF-1-app-feature-flags.md.
 */

export interface ModuleDef {
  /** Stable identifier used in the DB and in gate checks. NEVER change once set. */
  key: string;
  /** Human-readable label rendered in sidebar + super admin toggle tree. */
  label: string;
  /** Lucide icon name (resolved to component by the consumer). */
  icon?: string;
  /** Route path when clicked. Absent on parent-only modules (e.g., "kpi" is a header). */
  href?: string;
  /** Parent key for sub-modules. Derived from the dot-prefix but stated explicitly for clarity. */
  parentKey?: string;
}

export interface AppModuleConfig {
  /** Matches `App.slug` in the database. */
  appSlug: string;
  /** Flat list; hierarchy inferred from `parentKey` / dot-prefix. */
  modules: ModuleDef[];
}

export const MODULE_REGISTRY: AppModuleConfig[] = [
  {
    appSlug: "quikscale",
    modules: [
      { key: "dashboard", label: "Dashboard", icon: "LayoutDashboard", href: "/dashboard" },

      { key: "kpi", label: "KPI", icon: "Target" },
      { key: "kpi.individual", label: "Individual KPI", icon: "User", href: "/kpi", parentKey: "kpi" },
      { key: "kpi.teams", label: "Teams KPI", icon: "Users", href: "/kpi/teams", parentKey: "kpi" },

      { key: "priority", label: "Priority", icon: "CheckSquare", href: "/priority" },

      { key: "orgSetup", label: "Org Setup", icon: "Building2" },
      { key: "orgSetup.teams", label: "Teams", icon: "Users", href: "/org-setup/teams", parentKey: "orgSetup" },
      { key: "orgSetup.users", label: "Users", icon: "User", href: "/org-setup/users", parentKey: "orgSetup" },
      { key: "orgSetup.quarters", label: "Quarter Settings", icon: "CalendarDays", href: "/org-setup/quarters", parentKey: "orgSetup" },

      { key: "www", label: "WWW", icon: "Activity", href: "/www" },

      { key: "meetings", label: "Meeting Rhythm", icon: "Calendar" },
      { key: "meetings.dashboard", label: "Dashboard", icon: "LayoutDashboard", href: "/meetings", parentKey: "meetings" },
      { key: "meetings.dailyHuddle", label: "Daily Huddle", icon: "Clock", href: "/meetings/daily-huddle", parentKey: "meetings" },
      { key: "meetings.weekly", label: "Weekly Meeting", icon: "CalendarDays", href: "/meetings/weekly", parentKey: "meetings" },
      { key: "meetings.monthly", label: "Monthly Meeting", icon: "CalendarDays", href: "/meetings/monthly", parentKey: "meetings" },
      { key: "meetings.quarterly", label: "Quarterly Offsite", icon: "CalendarDays", href: "/meetings/quarterly", parentKey: "meetings" },
      { key: "meetings.annual", label: "Annual Planning", icon: "CalendarDays", href: "/meetings/annual", parentKey: "meetings" },
      { key: "meetings.templates", label: "Templates", icon: "List", href: "/meetings/templates", parentKey: "meetings" },
      { key: "meetings.history", label: "History", icon: "BookOpen", href: "/meetings/history", parentKey: "meetings" },

      { key: "opsp", label: "OPSP", icon: "FileText" },
      { key: "opsp.create", label: "Create OPSP", icon: "FileText", href: "/opsp", parentKey: "opsp" },
      { key: "opsp.history", label: "OPSP HISTORY", icon: "BookOpen", href: "/opsp/history", parentKey: "opsp" },
      { key: "opsp.review", label: "OPSP Review", icon: "Star", href: "/opsp/review", parentKey: "opsp" },
      { key: "opsp.categories", label: "Category Mgmt", icon: "List", href: "/opsp/categories", parentKey: "opsp" },

      { key: "analytics", label: "Analytics", icon: "TrendingUp" },
      { key: "analytics.scorecard", label: "Scorecard", icon: "BarChart2", href: "/performance/scorecard", parentKey: "analytics" },
      { key: "analytics.individual", label: "Individual", icon: "User", href: "/performance/individual", parentKey: "analytics" },
      { key: "analytics.teams", label: "Teams", icon: "Users", href: "/performance/teams", parentKey: "analytics" },
      { key: "analytics.trends", label: "Trends", icon: "LineChart", href: "/performance/trends", parentKey: "analytics" },

      { key: "people", label: "People", icon: "UserCheck" },
      { key: "people.cycle", label: "Cycle", icon: "Activity", href: "/performance/cycle", parentKey: "people" },
      { key: "people.goals", label: "Goals", icon: "Target", href: "/performance/goals", parentKey: "people" },
      { key: "people.self", label: "Self-Assessment", icon: "User", href: "/performance/self", parentKey: "people" },
      { key: "people.reviews", label: "Reviews", icon: "ClipboardList", href: "/performance/reviews", parentKey: "people" },
      { key: "people.oneOnOne", label: "1:1s", icon: "Users", href: "/performance/one-on-one", parentKey: "people" },
      { key: "people.feedback", label: "Feedback", icon: "MessageSquare", href: "/performance/feedback", parentKey: "people" },
      { key: "people.talent", label: "Talent", icon: "Layers", href: "/performance/talent", parentKey: "people" },
    ],
  },
  {
    appSlug: "admin",
    modules: [
      { key: "overview", label: "Overview", icon: "LayoutDashboard", href: "/dashboard" },
      { key: "members", label: "Members", icon: "Users", href: "/members" },
      { key: "teams", label: "Teams", icon: "FolderTree", href: "/teams" },
      { key: "apps", label: "Apps", icon: "AppWindow", href: "/apps" },
      { key: "roles", label: "Roles", icon: "ShieldCheck", href: "/roles" },
      { key: "settings", label: "Settings", icon: "Settings", href: "/settings" },
    ],
  },
];

/* ─── Utilities ───────────────────────────────────────────────────────── */

/**
 * Returns the dot-path ancestors of a module key, excluding the key itself.
 *
 *   ancestorsOf("kpi.teams")       -> ["kpi"]
 *   ancestorsOf("meetings.weekly") -> ["meetings"]
 *   ancestorsOf("kpi")             -> []
 */
export function ancestorsOf(moduleKey: string): string[] {
  const parts = moduleKey.split(".");
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    out.push(parts.slice(0, i).join("."));
  }
  return out;
}

/**
 * Cascade rule: a module is enabled iff itself AND every ancestor are enabled.
 *
 *   isModuleEnabled("kpi.teams", new Set())         -> true  (nothing disabled)
 *   isModuleEnabled("kpi.teams", new Set(["kpi"]))  -> false (parent disabled)
 *   isModuleEnabled("kpi.teams", new Set(["kpi.teams"])) -> false
 */
export function isModuleEnabled(moduleKey: string, disabled: Set<string>): boolean {
  if (disabled.has(moduleKey)) return false;
  for (const ancestor of ancestorsOf(moduleKey)) {
    if (disabled.has(ancestor)) return false;
  }
  return true;
}

/** Return the app config for a given slug, or undefined if unknown. */
export function getAppConfig(appSlug: string): AppModuleConfig | undefined {
  return MODULE_REGISTRY.find((a) => a.appSlug === appSlug);
}

/**
 * Filter a list of modules to only those that should be visible given the
 * disabled-set. Applies the cascade rule. Preserves order.
 */
export function visibleModules(
  modules: readonly ModuleDef[],
  disabled: Set<string>,
): ModuleDef[] {
  return modules.filter((m) => isModuleEnabled(m.key, disabled));
}

/**
 * Reverse lookup: given a URL path, find the most specific module whose href
 * matches (longest prefix wins). Used by sidebar active-state highlighting
 * AND by the middleware/layout gate (if we ever want path-based gating).
 *
 * Handles trailing slashes and exact matches.
 */
export function findModuleByPath(
  appSlug: string,
  pathname: string,
): ModuleDef | undefined {
  const app = getAppConfig(appSlug);
  if (!app) return undefined;
  let best: ModuleDef | undefined;
  let bestLen = -1;
  for (const m of app.modules) {
    if (!m.href) continue;
    if (pathname === m.href || pathname.startsWith(m.href + "/")) {
      if (m.href.length > bestLen) {
        bestLen = m.href.length;
        best = m;
      }
    }
  }
  return best;
}
