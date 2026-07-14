"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_RESOURCE } from "@/lib/api/permissionsRegistry";
import {
  LayoutDashboard,
  Package,
  Boxes,
  ArrowLeftRight,
  Wrench,
  ClipboardList,
  Mail,
  BarChart2,
  Users,
  UserCog,
  Settings,
  Tags,
  X,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  sub?: boolean;
  /** Overrides the default `<NAV_RESOURCE[href]>:view` visibility check. */
  perm?: { resource: string; action: string };
};
type NavSection = { label: string | null; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      // Member landing — their own assigned assets (any Asset:view holder).
      { label: "My Assets", href: "/employee-view", icon: Boxes, perm: { resource: "Asset", action: "view" } },
      // Full org register — asset managers/admins only.
      { label: "Asset Inventory", href: "/assets", icon: Package, perm: { resource: "Asset", action: "viewAll" } },
      { label: "Category Master", href: "/assets/categories", icon: Tags, sub: true },
      { label: "Assignments", href: "/assignments", icon: ArrowLeftRight },
      { label: "Repair & Recovery", href: "/repair", icon: Wrench },
    ],
  },
  {
    label: "Reports & Logs",
    items: [
      { label: "Audit Log", href: "/audit-log", icon: ClipboardList },
      { label: "Notification", href: "/notifications", icon: Mail },
      { label: "Reports", href: "/reports", icon: BarChart2 },
    ],
  },
  {
    label: "Views",
    items: [{ label: "User Directory", href: "/users", icon: Users }],
  },
  {
    label: "Admin",
    items: [
      { label: "User Management", href: "/settings/user-management", icon: UserCog },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

interface SidebarProps {
  permissions: string[];
  isAdmin: boolean;
  displayName: string;
  roleName: string | null;
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ permissions, isAdmin, displayName, roleName, mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const permSet = new Set(permissions);

  const canSee = (item: NavItem) => {
    if (item.perm) return isAdmin || permSet.has(`${item.perm.resource}:${item.perm.action}`);
    const resource = NAV_RESOURCE[item.href];
    if (!resource) return true;
    if (resource === "Settings") return isAdmin;
    return isAdmin || permSet.has(`${resource}:view`);
  };

  const initials = displayName
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[230px] flex-col bg-accent-800 text-white transition-transform md:static md:z-auto md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
              <Package className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">QuikAsset</p>
              <p className="text-[10px] leading-tight text-white/50">Asset management</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-white/10 md:hidden" aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
          {NAV_SECTIONS.map((section, si) => {
            const items = section.items.filter((i) => canSee(i));
            if (items.length === 0) return null;
            return (
              <div key={si}>
                {section.label && (
                  <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                    {section.label}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <li key={item.href} className={item.sub ? "pl-4" : ""}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 font-medium transition-colors",
                            item.sub ? "text-xs" : "text-sm",
                            active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
                          )}
                        >
                          <item.icon className={cn("flex-shrink-0", item.sub ? "h-3.5 w-3.5" : "h-4 w-4")} />
                          <span className="flex-1">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold">
              {initials || "U"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{displayName}</p>
              <p className="text-[10px] capitalize text-white/50">{roleName ?? "Member"}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
