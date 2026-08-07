/**
 * App manifest — required for every QuikIT app.
 *
 * The launcher (apps/quikit) reads each app's manifest at build time to
 * generate its app grid + permissions list. Keep this file static (no
 * runtime work). The integration owner verifies the manifest during
 * integration; do not edit fields after the integration owner has
 * signed off (rename/delete the app instead).
 */
export interface AppManifest {
  /** Stable kebab-case id. Used in URLs, audit logs, feature flags. */
  appId: string;
  /** Human-readable name shown in the launcher grid. */
  name: string;
  /** One-line description shown on hover in the launcher. */
  description: string;
  /** Route prefix this app owns at the platform level (e.g. "/social"). */
  routePrefix: string;
  /** Lucide icon name used in the launcher tile. */
  icon: string;
  /**
   * Permissions this app reads/writes — must match `Permission` enum in
   * @quikit/shared. Devs MUST NOT invent new permission strings; coordinate
   * with the integration owner first.
   */
  permissions: string[];
  /**
   * Top-level navigation entries surfaced in the app sidebar. Order matters.
   * Each entry corresponds to a route under `routePrefix`.
   */
  navigation: { label: string; href: string; icon: string }[];
}

const manifest: AppManifest = {
  appId: "credflow",
  name: "CredFlow",
  description: "Leads, accounts, contacts, opportunities, automations, and telephony — sales execution.",
  routePrefix: "/credflow",
  icon: "Users",
  permissions: [],
  // Hrefs are this app's own routes (it runs on its own host, like quiktrack) —
  // they mirror the directories under `app/(dashboard)/`.
  navigation: [
    { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
    { label: "Leads", href: "/leads", icon: "Target" },
    { label: "Accounts", href: "/accounts", icon: "Building2" },
    { label: "Contacts", href: "/contacts", icon: "UserSquare2" },
    { label: "Opportunities", href: "/opportunities", icon: "TrendingUp" },
    { label: "Quotes", href: "/quotes", icon: "FileText" },
    { label: "Orders", href: "/orders", icon: "ShoppingCart" },
    { label: "Activities", href: "/activities", icon: "ListChecks" },
    { label: "Tasks", href: "/tasks", icon: "CheckSquare" },
    { label: "Telephony", href: "/telephony", icon: "Phone" },
    { label: "Automations", href: "/automations", icon: "Zap" },
    { label: "Reports", href: "/reports", icon: "BarChart3" },
    { label: "Imports", href: "/imports", icon: "Upload" },
    { label: "Settings", href: "/settings", icon: "Settings" },
  ],
};

export default manifest;
