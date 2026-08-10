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
  appId: "quikcrm",
  name: "QuikCRM",
  description: "Leads, accounts, contacts, automations, and telephony — sales execution.",
  routePrefix: "/quikcrm",
  icon: "Users",
  permissions: [],
  navigation: [
    { label: "Dashboard", href: "/quikcrm", icon: "LayoutDashboard" },
    { label: "Leads", href: "/quikcrm/leads", icon: "Target" },
    { label: "Accounts", href: "/quikcrm/accounts", icon: "Building2" },
    { label: "Contacts", href: "/quikcrm/contacts", icon: "UserSquare2" },
    { label: "Activities", href: "/quikcrm/activities", icon: "ListChecks" },
    { label: "Automations", href: "/quikcrm/automations", icon: "Zap" },
    { label: "Imports", href: "/quikcrm/imports", icon: "Upload" },
  ],
};

export default manifest;
