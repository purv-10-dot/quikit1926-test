"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Building2,
  UserPlus,
  Briefcase,
  Activity,
  CheckSquare,
  Phone,
  Workflow,
  BarChart3,
  Gauge,
  Settings,
  Files,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Folder,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSidebar } from "@/components/layout/sidebar-context";
import { usePermissions } from "@/hooks/use-permissions";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** CRM module gating this item. Omit for items not modelled by RBAC
   * (they stay visible to everyone). */
  module?: string;
}

// Inventory nav is currently disabled. To re-enable: uncomment INVENTORY_ITEMS,
// INVENTORY_GROUP, and its render in SidebarNav, AND re-add the icons
// `Package, Tags, FileText, PackageCheck` to the lucide-react import above.
// const INVENTORY_ITEMS: NavItem[] = [
//   { href: "/quotes", label: "Quotes", icon: FileText, module: "quotes" },
//   { href: "/orders", label: "Orders", icon: PackageCheck },
//   { href: "/products", label: "Products", icon: Package },
//   { href: "/price-lists", label: "Price Lists", icon: Tags },
// ];

const ACTIVITIES_ITEMS: NavItem[] = [
  { href: "/activities", label: "Activities", icon: Activity, module: "activities" },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, module: "tasks" },
  { href: "/telephony/dialer", label: "Telephony", icon: Phone, module: "telephony" },
  { href: "/automations/workflows", label: "Automations", icon: Workflow, module: "automations" },
];

interface NavGroupConfig {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  storageKey: string;
}

// const INVENTORY_GROUP: NavGroupConfig = {
//   label: "Inventory",
//   icon: Folder,
//   items: INVENTORY_ITEMS,
//   storageKey: "quikcrm.sidebar.inventory.expanded",
// };

const ACTIVITIES_GROUP: NavGroupConfig = {
  label: "Activities",
  icon: Folder,
  items: ACTIVITIES_ITEMS,
  storageKey: "quikcrm.sidebar.activities.expanded",
};

const NAV_TOP: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { href: "/leads", label: "Leads", icon: UserPlus, module: "leads" },
  { href: "/accounts", label: "Accounts", icon: Building2, module: "accounts" },
  { href: "/contacts", label: "Contacts", icon: Users, module: "contacts" },
  { href: "/opportunities", label: "Opportunities", icon: Briefcase, module: "opportunities" },
  { href: "/documents", label: "Documents", icon: Files, module: "documents" },
  { href: "/reports", label: "Reports", icon: BarChart3, module: "reports" },
];

const NAV_BOTTOM: NavItem[] = [
  // Campaigns nav is currently disabled. To re-enable: uncomment the line below
  // and re-add `Megaphone` to the lucide-react import above.
  // { href: "/marketing/campaigns", label: "Campaigns", icon: Megaphone, module: "campaigns" },
  // Settings entry stays visible to everyone — it lands on the user's own
  // profile. Admin-only sub-pages (Users, Permission Templates, Company) are
  // gated inside the settings layout, not here.
  { href: "/settings/profile", label: "Settings", icon: Settings },
];

function isNavItemActive(pathname: string, href: string): boolean {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  if (href.startsWith("/telephony")) return pathname.startsWith("/telephony");
  if (href.startsWith("/automations")) return pathname.startsWith("/automations");
  return false;
}

function isGroupPath(pathname: string, items: NavItem[]): boolean {
  return items.some((item) => isNavItemActive(pathname, item.href));
}

export function Sidebar() {
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } = useSidebar();
  const pathname = usePathname();

  // Close the mobile drawer when the route changes
  useEffect(() => {
    if (mobileOpen) setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Desktop sidebar (lg+): full-height column with its own brand header
       * above the nav. Width animates between collapsed (16) and expanded (60). */}
      <aside
        className={
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-crm-border bg-white transition-[width] duration-200 ease-out lg:flex " +
          (collapsed ? "w-16" : "w-60")
        }
        aria-label="Primary navigation"
      >
        <SidebarBrand
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
        <SidebarNav pathname={pathname} collapsed={collapsed} />
      </aside>

      {/* Mobile drawer (<lg): off-canvas overlay covering the viewport. */}
      <div
        className={
          "fixed inset-0 z-40 lg:hidden " +
          (mobileOpen ? "" : "pointer-events-none")
        }
        aria-hidden={!mobileOpen}
      >
        <div
          className={
            "absolute inset-0 bg-slate-900/40 transition-opacity duration-200 " +
            (mobileOpen ? "opacity-100" : "opacity-0")
          }
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={
            "absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-crm-border bg-white shadow-crm-modal transition-transform duration-200 ease-out " +
            (mobileOpen ? "translate-x-0" : "-translate-x-full")
          }
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <SidebarBrand
            collapsed={false}
            mobileClose={() => setMobileOpen(false)}
          />
          <SidebarNav pathname={pathname} collapsed={false} />
        </aside>
      </div>
    </>
  );
}

function QuikcredflowMark({ className = "h-8 w-8 rounded-lg object-cover" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icon.svg" alt="" width={32} height={32} className={className} />
  );
}

function SidebarBrand({
  collapsed,
  onToggleCollapsed,
  mobileClose,
}: {
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  mobileClose?: () => void;
}) {
  return (
    <div
      className={
        "flex h-14 shrink-0 items-center border-b border-crm-border " +
        (collapsed ? "justify-center px-2" : "justify-between px-3")
      }
    >
      {collapsed ? (
        <Link href="/dashboard" aria-label="QuikCredFlow home" className="shrink-0">
          <QuikcredflowMark />
        </Link>
      ) : (
        <Link
          href="/dashboard"
          aria-label="QuikCredFlow home"
          className="flex min-w-0 items-center gap-2.5"
        >
          <QuikcredflowMark className="h-8 w-8 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-crm-text">
              <span>Quik</span>
              <span className="text-crm-blue">CredFlow</span>
            </p>
            <p className="text-[10px] uppercase tracking-wider text-crm-muted">
              Sales OS
            </p>
          </div>
        </Link>
      )}

      <div className="flex shrink-0 items-center gap-1">
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="hidden h-8 w-8 items-center justify-center rounded-md text-crm-muted transition hover:bg-crm-panel hover:text-crm-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow lg:inline-flex"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
        {mobileClose && (
          <button
            type="button"
            onClick={mobileClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-crm-muted hover:bg-crm-panel hover:text-crm-text"
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function navLinkClass(active: boolean, collapsed: boolean, indented = false): string {
  return (
    "group flex items-center gap-3 rounded-lg text-sm transition " +
    (collapsed ? "justify-center px-2 py-2" : indented ? "px-3 py-1.5 pl-9" : "px-3 py-2") +
    " " +
    (active
      ? "bg-crm-blue-soft font-medium text-crm-blue"
      : "text-crm-text hover:bg-crm-panel")
  );
}

function navIconClass(active: boolean): string {
  return (
    "shrink-0 " +
    (active ? "text-crm-blue" : "text-crm-muted group-hover:text-crm-text")
  );
}

function NavLink({
  item,
  pathname,
  collapsed,
  indented = false,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  indented?: boolean;
  onNavigate?: () => void;
}) {
  const active = isNavItemActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={navLinkClass(active, collapsed, indented)}
    >
      <Icon size={indented ? 16 : 18} className={navIconClass(active)} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function useNavGroupExpanded(
  pathname: string,
  config: NavGroupConfig,
): [boolean, () => void] {
  const active = isGroupPath(pathname, config.items);
  const [open, setOpen] = useState(active);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(config.storageKey);
      if (stored === "1" || stored === "0") {
        setOpen(stored === "1");
        return;
      }
    } catch {
      // ignore
    }
    if (active) setOpen(true);
  }, []);

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(config.storageKey, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, [config.storageKey]);

  return [open, toggle];
}

function navGroupButtonClass(groupActive: boolean, collapsed: boolean): string {
  return (
    "group flex w-full items-center rounded-lg text-sm transition " +
    (collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2") +
    " " +
    (groupActive
      ? "bg-crm-blue-soft font-medium text-crm-blue"
      : "text-crm-text hover:bg-crm-panel")
  );
}

function NavGroupSubmenu({
  config,
  pathname,
  collapsed,
  onNavigate,
  className,
  indented = false,
}: {
  config: NavGroupConfig;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
  className?: string;
  indented?: boolean;
}) {
  return (
    <div className={className} role="group" aria-label={config.label}>
      {config.items.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          pathname={pathname}
          collapsed={collapsed}
          indented={indented}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

function CollapsibleNavGroup({
  config,
  pathname,
  collapsed,
}: {
  config: NavGroupConfig;
  pathname: string;
  collapsed: boolean;
}) {
  const groupActive = isGroupPath(pathname, config.items);
  const [open, toggle] = useNavGroupExpanded(pathname, config);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const GroupIcon = config.icon;

  useEffect(() => {
    if (!flyoutOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (flyoutRef.current?.contains(e.target as Node)) return;
      setFlyoutOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [flyoutOpen]);

  const iconClass =
    "shrink-0 fill-current " +
    (groupActive
      ? "text-crm-blue"
      : "text-crm-blue/70 group-hover:text-crm-blue");

  if (collapsed) {
    return (
      <div ref={flyoutRef} className="relative">
        <button
          type="button"
          onClick={() => setFlyoutOpen(!flyoutOpen)}
          title={config.label}
          aria-label={config.label}
          aria-expanded={flyoutOpen}
          className={navGroupButtonClass(groupActive, true)}
        >
          <GroupIcon size={18} className={iconClass} strokeWidth={1.25} />
        </button>
        {flyoutOpen && (
          <NavGroupSubmenu
            config={config}
            pathname={pathname}
            collapsed={false}
            onNavigate={() => setFlyoutOpen(false)}
            className="absolute left-full top-0 z-50 ml-1 min-w-[11rem] rounded-lg border border-crm-border bg-white py-1 shadow-crm-modal"
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={navGroupButtonClass(groupActive, false)}
      >
        <GroupIcon size={18} className={iconClass} strokeWidth={1.25} />
        <span className="min-w-0 flex-1 truncate text-left">{config.label}</span>
        <ChevronDown
          size={16}
          className={
            "shrink-0 text-crm-muted transition-transform duration-200 " +
            (open ? "rotate-180" : "")
          }
        />
      </button>
      {open && (
        <NavGroupSubmenu
          config={config}
          pathname={pathname}
          collapsed={false}
          indented
          className="mt-0.5 flex flex-col gap-0.5"
        />
      )}
    </div>
  );
}

function SidebarNav({
  pathname,
  collapsed,
}: {
  pathname: string;
  collapsed: boolean;
}) {
  const { can, isAdmin } = usePermissions();

  // An item is visible when it isn't gated by a module, or the user can view
  // that module. `can` already returns true for admins. Items the RBAC model
  // doesn't cover (Orders, Products, Price Lists) have no `module` and stay on.
  const canSee = (item: NavItem) => !item.module || can(item.module, "view");
  const filterGroup = (cfg: NavGroupConfig): NavGroupConfig => ({
    ...cfg,
    items: cfg.items.filter(canSee),
  });

  const topItems = NAV_TOP.filter(canSee);
  const bottomItems = NAV_BOTTOM.filter(canSee);
  // const inventoryGroup = filterGroup(INVENTORY_GROUP);
  const activitiesGroup = filterGroup(ACTIVITIES_GROUP);

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
      {topItems.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          pathname={pathname}
          collapsed={collapsed}
        />
      ))}
      {isAdmin ? (
        <NavLink
          item={{ href: "/overview", label: "Overview", icon: Gauge }}
          pathname={pathname}
          collapsed={collapsed}
        />
      ) : null}
      {/* {inventoryGroup.items.length > 0 && (
        <CollapsibleNavGroup
          config={inventoryGroup}
          pathname={pathname}
          collapsed={collapsed}
        />
      )} */}
      {activitiesGroup.items.length > 0 && (
        <CollapsibleNavGroup
          config={activitiesGroup}
          pathname={pathname}
          collapsed={collapsed}
        />
      )}
      {bottomItems.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          pathname={pathname}
          collapsed={collapsed}
        />
      ))}
    </nav>
  );
}
