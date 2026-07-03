/**
 * App manifest — required for every QuikIT app.
 *
 * The launcher (apps/quikit) reads each app's manifest at build time to
 * generate its app grid + permissions list. Keep this file static.
 */
export interface AppManifest {
  /** Stable kebab-case id. Used in URLs, audit logs, feature flags. */
  appId: string;
  /** Human-readable name shown in the launcher grid. */
  name: string;
  /** One-line description shown on hover in the launcher. */
  description: string;
  /** Route prefix this app owns at the platform level. */
  routePrefix: string;
  /** Lucide icon name used in the launcher tile. */
  icon: string;
  /** Permissions this app reads/writes (in-app RBAC, managed inside the app). */
  permissions: string[];
  /** Top-level navigation entries surfaced in the app sidebar. */
  navigation: { label: string; href: string; icon: string }[];
}

const manifest: AppManifest = {
  appId: "quiksupport",
  name: "QuikSupport",
  description: "Helpdesk & ticketing — tickets, SLA tracking, categories, agent queues, reports",
  routePrefix: "/quiksupport",
  icon: "LifeBuoy",
  permissions: [
    "quiksupport.ticket.create",
    "quiksupport.ticket.assign",
    "quiksupport.ticket.update",
    "quiksupport.ticket.close",
    "quiksupport.ticket.escalate",
    "quiksupport.user.manage",
    "quiksupport.role.manage",
  ],
  navigation: [
    { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
    { label: "Tickets", href: "/dashboard", icon: "Ticket" },
    { label: "Queue", href: "/dashboard", icon: "ListChecks" },
    { label: "Reports", href: "/dashboard", icon: "BarChart3" },
  ],
};

export default manifest;
