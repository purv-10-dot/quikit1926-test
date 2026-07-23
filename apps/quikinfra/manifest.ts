/**
 * App manifest — QuikInfra (Construction ERP).
 *
 * The launcher (apps/quikit) + integration tooling read this file as the
 * platform-level "ID card": stable appId, route prefix, launcher navigation,
 * and the permission strings this app owns. Keep it static (no runtime work).
 * The integration owner verifies it during integration; do not edit fields
 * after sign-off (rename/delete the app instead).
 *
 * Permissions are sourced from the RBAC registry (`ALL_PERMISSION_KEYS` in
 * lib/rbac/permissions.ts) — the single source of truth for the keys actually
 * enforced by `requirePermission(...)` — so this list can never drift from
 * what the app enforces.
 */
import { ALL_PERMISSION_KEYS } from "./lib/rbac/permissions";

export interface AppManifest {
  /** Stable kebab-case id. Used in URLs, audit logs, feature flags. */
  appId: string;
  /** Human-readable name shown in the launcher grid. */
  name: string;
  /** One-line description shown on hover in the launcher. */
  description: string;
  /** Route prefix this app owns at the platform level (e.g. "/quikinfra"). */
  routePrefix: string;
  /** Lucide icon name used in the launcher tile. */
  icon: string;
  /**
   * Permissions this app reads/writes — the real enforced keys from
   * lib/rbac/permissions.ts (e.g. "boq.lock", "dpr.approve").
   */
  permissions: string[];
  /**
   * Top-level navigation entries surfaced in the app sidebar. Order matters.
   * Each entry corresponds to a route under the app.
   */
  navigation: { label: string; href: string; icon: string }[];
}

const manifest: AppManifest = {
  appId: "quikinfra",
  name: "QuikInfra",
  description:
    "Construction ERP — Projects, BOQ, DPR/RAB, Purchase, Store, Finance",
  routePrefix: "/quikinfra",
  icon: "HardHat",
  permissions: [...ALL_PERMISSION_KEYS],
  navigation: [
    { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
    { label: "Masters", href: "/masters", icon: "Database" },
    { label: "Projects", href: "/projects", icon: "FolderKanban" },
    { label: "Purchase", href: "/purchase", icon: "ShoppingCart" },
    { label: "Store", href: "/store", icon: "Warehouse" },
    { label: "Approvals", href: "/approvals", icon: "CheckSquare" },
    { label: "Reports", href: "/reports", icon: "BarChart3" },
    { label: "Settings", href: "/settings", icon: "Settings" },
  ],
};

export default manifest;