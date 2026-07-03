/**
 * App manifest — read by the launcher (apps/quikit) to describe QuikAsset.
 * Keep static; the launcher's tile data ultimately comes from the DB `App`
 * row (seed via scripts/seed-app.ts), this file documents the contract.
 */
export interface AppManifest {
  appId: string;
  name: string;
  description: string;
  routePrefix: string;
  icon: string;
  permissions: string[];
  navigation: { label: string; href: string; icon: string }[];
}

const manifest: AppManifest = {
  appId: "quikasset",
  name: "QuikAsset",
  description: "IT & fixed-asset lifecycle management — inventory, assignments, repairs, budgets & reports",
  routePrefix: "/",
  icon: "Package",
  permissions: [],
  navigation: [
    { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
    { label: "Asset Inventory", href: "/assets", icon: "Package" },
    { label: "Category Master", href: "/assets/categories", icon: "Tags" },
    { label: "Assignments", href: "/assignments", icon: "ArrowLeftRight" },
    { label: "Repair & Recovery", href: "/repair", icon: "Wrench" },
    { label: "Audit Log", href: "/audit-log", icon: "ClipboardList" },
    { label: "Notification", href: "/notifications", icon: "Mail" },
    { label: "Reports", href: "/reports", icon: "BarChart2" },
    { label: "User Directory", href: "/users", icon: "Users" },
    { label: "Settings", href: "/settings", icon: "Settings" },
  ],
};

export default manifest;
