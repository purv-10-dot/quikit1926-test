"use client";

/**
 * QuikConstructionShell — Self-contained app shell with sidebar navigation.
 */

import { useState, useMemo, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { usePermissions } from "@/hooks/use-permissions";
import {
  LayoutDashboard, Database, ShoppingCart, Warehouse,
  FolderKanban, CheckCircle2, FileBarChart2, Settings,
  Package, Building2, Truck, ClipboardList,
  FileText, BarChart3, Fuel, ArrowLeftRight,
  CalendarCheck, GitCompareArrows, HardHat, Hammer,
  Receipt, GanttChart, ListTodo, BadgeCheck, UserCog,
  ShieldCheck, Workflow, Globe, Boxes, MapPin,
  CreditCard, Calculator, FileSpreadsheet,
  ChevronDown, Menu, Search,
  LogOut, User, Bell, MessageSquare,
  AlertTriangle, Wallet, Wrench, ClipboardCheck, ListTree,
} from "lucide-react";

// Sidebar chip labels for the PDF-spec user types. Mirrors the labels
// used in the User Management table (see settings/users/page.tsx) so the
// sidebar's "role" line matches what an admin sees in the user list.
const USER_TYPE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  HO_USER: "HO User",
  SITE_ADMIN: "Site Admin",
  USER: "User",
};

// ─── Nav Types ──────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href?: string;
  iconComponent?: any;
  isSection?: boolean;
  children?: NavItem[];
  /**
   * A permission string (or array — item shows if user has ANY of them)
   * that the user must hold to see this item. The wildcard `"*"` super
   * admin bypass and the per-page matrix still apply on top of this gate.
   */
  requiredPermission?: string | string[];
  /**
   * Ties the item (and its entire subtree) to a module key from
   * `ASSIGNABLE_MODULES`. If set, the item is hidden when the current user
   * has a `modulesAssigned` whitelist that doesn't include this key.
   * Super admins (modulesAssigned === null) bypass the check.
   */
  moduleKey?: string;
  badge?: number;
}

// ─── Navigation Config ──────────────────────────────────────────────

// Every nav item declares the permission needed to see it. Parent items
// with children auto-hide when ALL children are hidden (handled by
// `filterNav` in the shell render, not duplicated on parents).
const CONSTRUCTION_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", iconComponent: LayoutDashboard },
  { label: "ADMIN / SETUP", isSection: true },
  {
    label: "Organization",
    iconComponent: Globe,
    moduleKey: "organization",
    children: [
      { label: "Companies",          href: "/masters/companies",        iconComponent: Globe,        requiredPermission: "masters.read" },
      { label: "Departments",        href: "/masters/departments",      iconComponent: Building2,    requiredPermission: "masters.read" },
      { label: "GST Codes",          href: "/masters/gst",              iconComponent: Receipt,      requiredPermission: "finance.gst_config" },
      { label: "TDS Codes",          href: "/masters/tds",              iconComponent: CreditCard,   requiredPermission: "finance.tds_config" },
      { label: "UOM",                href: "/masters/uom",              iconComponent: Calculator,   requiredPermission: "masters.read" },
      { label: "Work Categories",    href: "/masters/work-categories",  iconComponent: ListTodo,     requiredPermission: "masters.read" },
      { label: "Terms & Conditions", href: "/masters/terms",            iconComponent: FileText,     requiredPermission: "masters.read" },
    ],
  },
  { label: "MASTER DATA", isSection: true },
  {
    label: "Masters",
    iconComponent: Database,
    moduleKey: "masters",
    children: [
      { label: "Projects",          href: "/masters/projects",     iconComponent: FolderKanban, requiredPermission: "masters.read" },
      { label: "Items / Materials", href: "/masters/items",        iconComponent: Package,      requiredPermission: "masters.read" },
      { label: "Item Groups",       href: "/masters/item-groups",  iconComponent: Boxes,        requiredPermission: "masters.read" },
      { label: "Vendors",           href: "/masters/vendors",      iconComponent: Truck,        requiredPermission: "masters.read" },
      { label: "Contractors",       href: "/masters/contractors",  iconComponent: HardHat,      requiredPermission: "masters.read" },
      { label: "Customers",         href: "/masters/customers",    iconComponent: Building2,    requiredPermission: "masters.read" },
      { label: "Locations / Sites", href: "/masters/locations",    iconComponent: MapPin,       requiredPermission: "masters.read" },
      { label: "Machinery",         href: "/masters/machinery",    iconComponent: Hammer,       requiredPermission: "masters.read" },
      { label: "Assets / Tools",    href: "/masters/assets",       iconComponent: Wrench,       requiredPermission: "masters.read" },
      { label: "Cost Centers",      href: "/masters/cost-centers", iconComponent: BarChart3,    requiredPermission: "masters.read" },
    ],
  },
  // Order: Masters → Projects → Procurement → Inventory.
  // PROJECTS sits up here (right after MASTER DATA) because the project
  // setup workflow runs Masters → BOQ/WO/DPR → Purchase Requisitions →
  // Store Receipts. Putting Project Mgmt before Procurement matches the
  // user's mental model of how a site starts up.
  { label: "PROJECTS", isSection: true },
  {
    label: "Project Mgmt",
    iconComponent: FolderKanban,
    moduleKey: "project_mgmt",
    children: [
      { label: "BOQ",                  href: "/projects/boq",         iconComponent: FileSpreadsheet, requiredPermission: "boq.read" },
      { label: "WBS & Planning",       href: "/projects/wbs",         iconComponent: ListTree,        requiredPermission: "boq.read" },
      { label: "Material Estimation",  href: "/projects/estimation",  iconComponent: Calculator,      requiredPermission: "boq.read" },
      { label: "Work Orders",          href: "/projects/work-orders", iconComponent: Hammer,          requiredPermission: "wo.read" },
      { label: "Daily Progress (DPR)", href: "/projects/dpr",         iconComponent: CalendarCheck,   requiredPermission: "dpr.read" },
      { label: "Gantt View",           href: "/projects/gantt",       iconComponent: GanttChart,      requiredPermission: "boq.read" },
      { label: "Hindrance Register",   href: "/projects/hindrance",   iconComponent: AlertTriangle,   requiredPermission: "dpr.read" },
      { label: "Documents",            href: "/projects/documents",   iconComponent: FileText,        requiredPermission: "boq.read" },
    ],
  },
  { label: "PROCUREMENT", isSection: true },
  {
    label: "Purchase",
    iconComponent: ShoppingCart,
    moduleKey: "purchase",
    children: [
      { label: "Purchase Requisitions",  href: "/purchase/requisitions", iconComponent: ClipboardList,    requiredPermission: "purchase.mr.read" },
      { label: "Indents",                href: "/purchase/indents",      iconComponent: FileText,         requiredPermission: "purchase.indent.read" },
      { label: "RFQ",                       href: "/purchase/rfqs",           iconComponent: GitCompareArrows, requiredPermission: "purchase.po.read" },
      { label: "Quote Analysis & Shortlist", href: "/purchase/quote-analysis", iconComponent: ClipboardCheck,   requiredPermission: "purchase.po.read" },
      { label: "Purchase Orders",           href: "/purchase/orders",         iconComponent: FileSpreadsheet,  requiredPermission: "purchase.po.read" },
    ],
  },
  { label: "INVENTORY", isSection: true },
  {
    label: "Store",
    iconComponent: Warehouse,
    moduleKey: "store",
    children: [
      { label: "GRN",                  href: "/store/grn",            iconComponent: BadgeCheck,     requiredPermission: "purchase.grn.read" },
      { label: "Stock Register",       href: "/store/stock-register", iconComponent: BarChart3,      requiredPermission: "store.issue.read" },
      { label: "Material Issue",       href: "/store/issue",          iconComponent: Package,        requiredPermission: "store.issue.read" },
      { label: "Gate Pass",            href: "/store/gate-pass",      iconComponent: ClipboardList,  requiredPermission: "store.gate_pass.write" },
      { label: "Good Return",          href: "/store/good-return",    iconComponent: ArrowLeftRight, requiredPermission: "store.good_return.write" },
      { label: "Stock Transfer",       href: "/store/transfer",       iconComponent: ArrowLeftRight, requiredPermission: "store.transfer.read" },
      { label: "Stock Reconciliation", href: "/store/reconciliation", iconComponent: FileBarChart2,  requiredPermission: "store.recon.read" },
      { label: "Diesel Log",           href: "/store/diesel-log",     iconComponent: Fuel,           requiredPermission: "store.diesel.write" },
      { label: "Asset Management",     href: "/store/asset-management", iconComponent: Wrench,        requiredPermission: "store.asset_mgmt.view" },
    ],
  },
  { label: "QUALITY & SAFETY", isSection: true },
  {
    label: "Quality & Safety",
    iconComponent: ShieldCheck,
    moduleKey: "quality_safety",
    children: [
      { label: "Checklists",    href: "/quality/checklists",    iconComponent: ClipboardCheck, requiredPermission: "quality.read" },
      { label: "Inspections",   href: "/quality/inspections",   iconComponent: Search,         requiredPermission: "quality.read" },
      { label: "Incidents",     href: "/safety/incidents",      iconComponent: AlertTriangle,  requiredPermission: "safety.read" },
      { label: "Toolbox Talks", href: "/safety/toolbox-talks",  iconComponent: MessageSquare,  requiredPermission: "safety.read" },
    ],
  },
  { label: "FINANCE", isSection: true },
  {
    label: "Finance",
    iconComponent: CreditCard,
    moduleKey: "finance",
    children: [
      { label: "Vendor Payments", href: "/finance/vendor-payments", iconComponent: CreditCard,  requiredPermission: "finance.view" },
      { label: "Client Billing",  href: "/finance/client-billing",  iconComponent: Receipt,     requiredPermission: "finance.view" },
      { label: "Petty Cash",      href: "/finance/petty-cash",      iconComponent: Wallet,      requiredPermission: "finance.view" },
      { label: "Retention & SD",  href: "/finance/retention",       iconComponent: ShieldCheck, requiredPermission: "finance.view" },
    ],
  },
  { label: "SYSTEM", isSection: true },
  {
    label: "Approvals",
    href: "/approvals",
    iconComponent: CheckCircle2,
    // Only users who can actually approve something should see the inbox.
    // Any ONE of these permissions is enough (admins satisfy this via `*`).
    requiredPermission: [
      "purchase.mr.approve",
      "purchase.indent.approve_l1",
      "purchase.indent.approve_l2",
      "purchase.indent.approve_l3",
      "purchase.po.approve_l1",
      "purchase.po.approve_l2",
      "purchase.grn.approve",
      "store.issue.approve",
      "store.transfer.approve",
      "store.recon.approve",
      "store.good_return.approve",
      "store.gate_pass.approve",
      "wo.approve",
      "dpr.approve",
      "rab.approve",
    ],
  },
  { label: "Reports",   href: "/reports",   iconComponent: FileBarChart2, requiredPermission: "reports.read" },
  {
    label: "Settings",
    iconComponent: Settings,
    children: [
      { label: "Users",     href: "/settings/users",     iconComponent: UserCog,     requiredPermission: "settings.users" },
      { label: "Workflows", href: "/settings/workflows", iconComponent: Workflow,    requiredPermission: "settings.workflows" },
    ],
  },
];

/**
 * Filter nav by the current user's permission set. Rules:
 *   - Item with `moduleKey` is shown only if `hasModule(moduleKey)` — this
 *     is the outer gate that hides entire sidebar groups
 *     (Organization/Masters/Purchase/Store/Project Mgmt/Quality/Finance)
 *     for users whose `modulesAssigned` doesn't include that key.
 *   - Inside an allowed-module subtree, children are shown unconditionally:
 *     module assignment grants full page-level access to that module. The
 *     per-page Add/Edit/Delete controls still gate via the permission
 *     matrix, but the sidebar doesn't second-guess module assignment.
 *   - Outside any moduleKey subtree (Dashboard, Approvals, Settings):
 *     fall back to `requiredPermission` / role-based gating.
 *   - Parent items with children are shown only if at least one child survives.
 *   - Section dividers collapse away when they would be followed by no items.
 */
function filterNav(
  items: NavItem[],
  can: (perm: string | string[]) => boolean,
  hasModule: (moduleKey: string) => boolean,
  canViewMenu: (url: string | undefined) => boolean,
  insideAllowedModule = false,
): NavItem[] {
  const out: NavItem[] = [];
  for (const item of items) {
    if (item.isSection) {
      out.push(item);
      continue;
    }
    // Module-level gate comes first — if the user's modulesAssigned
    // excludes this key, skip the whole subtree including children.
    if (item.moduleKey && !hasModule(item.moduleKey)) {
      continue;
    }
    if (item.children) {
      // Once we're under a moduleKey-gated parent that passed the check,
      // every descendant is considered allowed — skip `requiredPermission`.
      const nextInside = insideAllowedModule || !!item.moduleKey;
      const kids = filterNav(item.children, can, hasModule, canViewMenu, nextInside);
      if (kids.length > 0) out.push({ ...item, children: kids });
      continue;
    }
    // Per-menu matrix gate — if admin explicitly set `view: false` for
    // this row in the Permissions page, hide it even inside an allowed
    // module. `canViewMenu` returns true when there's no matrix / the row
    // isn't listed, so this is a deny-only override.
    if (!canViewMenu(item.href)) {
      continue;
    }
    // Leaf node. Inside an allowed module → show unconditionally.
    // Outside any module subtree → fall back to role-based requiredPermission.
    if (insideAllowedModule) {
      out.push(item);
      continue;
    }
    if (!item.requiredPermission || can(item.requiredPermission)) {
      out.push(item);
    }
  }
  // Drop trailing sections + sections with no items after them
  const pruned: NavItem[] = [];
  for (let i = 0; i < out.length; i++) {
    const it = out[i]!;
    if (it.isSection) {
      // Look ahead — skip if no non-section items follow before the next section or EOF
      let hasContent = false;
      for (let j = i + 1; j < out.length; j++) {
        if (out[j]!.isSection) break;
        hasContent = true;
        break;
      }
      if (!hasContent) continue;
    }
    pruned.push(it);
  }
  return pruned;
}

// ─── Sidebar ────────────────────────────────────────────────────────

function NavItemComponent({ item, pathname, onNavigate, depth = 0 }: {
  item: NavItem; pathname: string; onNavigate: (href: string) => void; depth?: number;
}) {
  const [expanded, setExpanded] = useState(() => {
    if (!item.children) return false;
    return item.children.some(c => c.href && pathname.startsWith(c.href));
  });

  if (item.isSection) {
    return (
      <div className="px-3 pt-5 pb-1.5 flex items-center gap-2">
        <span aria-hidden className="w-1 h-1 rounded-full bg-orange-400/60" />
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.14em]">{item.label}</span>
        <span aria-hidden className="flex-1 h-px bg-gradient-to-r from-slate-200/80 to-transparent" />
      </div>
    );
  }

  const Icon = item.iconComponent;
  const isActive = item.href ? pathname === item.href || pathname.startsWith(item.href + "/") : false;
  const hasActiveChild = item.children?.some(c => c.href && (pathname === c.href || pathname.startsWith(c.href + "/")));

  if (item.children) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={`group relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
            hasActiveChild
              ? "text-orange-700 bg-orange-50/80 font-semibold"
              : "text-slate-700 hover:bg-orange-50/60 hover:text-orange-800"
          }`}
        >
          {hasActiveChild && (
            <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-gradient-to-b from-orange-500 to-orange-600" />
          )}
          {Icon && (
            <Icon
              className={`w-4 h-4 shrink-0 transition-colors ${
                hasActiveChild ? "text-orange-600" : "text-slate-400 group-hover:text-orange-600"
              }`}
            />
          )}
          <span className="flex-1 text-left font-medium">{item.label}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 group-hover:text-orange-600 transition-transform ${
              expanded ? "rotate-0" : "-rotate-90"
            }`}
          />
        </button>
        {expanded && (
          <div
            className={`ml-3 mt-1 space-y-0.5 border-l pl-2.5 transition-colors ${
              hasActiveChild ? "border-orange-200" : "border-slate-200"
            }`}
          >
            {item.children.map((child) => (
              <NavItemComponent key={child.label} item={child} pathname={pathname} onNavigate={onNavigate} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => item.href && onNavigate(item.href)}
      className={`group relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
        isActive
          ? "text-orange-700 bg-orange-50/80 font-semibold"
          : "text-slate-600 hover:bg-orange-50/60 hover:text-orange-800"
      }`}
    >
      {isActive && (
        <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-gradient-to-b from-orange-500 to-orange-600" />
      )}
      {Icon && (
        <Icon
          className={`w-4 h-4 shrink-0 transition-colors ${
            isActive ? "text-orange-600" : "text-slate-400 group-hover:text-orange-600"
          }`}
        />
      )}
      <span className="flex-1 text-left">{item.label}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">{item.badge}</span>
      )}
    </button>
  );
}

// ─── Main Shell ─────────────────────────────────────────────────────

export function QuikConstructionShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const { can, hasModule, canViewMenu, isLoading: permsLoading, roleKey, userType } = usePermissions();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Filter nav by the user's permission set + module whitelist + saved
  // permission matrix. While permissions are loading show the full nav
  // to avoid a flash of empty sidebar — once /api/me responds we hide
  // what the user can't see.
  const visibleNav = useMemo(
    () =>
      permsLoading
        ? CONSTRUCTION_NAV
        : filterNav(CONSTRUCTION_NAV, can, hasModule, canViewMenu),
    [permsLoading, can, hasModule, canViewMenu]
  );

  const handleNavigate = (href: string) => {
    router.push(href);
    setMobileMenuOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="relative flex items-center gap-3 px-4 py-4 border-b border-slate-200 bg-gradient-to-r from-orange-50 via-white to-white overflow-hidden">
        <span aria-hidden className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-orange-100/60 blur-2xl pointer-events-none" />
        <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 text-white flex items-center justify-center shadow-brand ring-1 ring-orange-300/40">
          <HardHat className="w-5 h-5" strokeWidth={2.25} />
        </div>
        <div className="relative min-w-0">
          <h1 className="text-sm font-bold text-slate-900 truncate tracking-tight">QuikConstruction</h1>
          <p className="text-[10px] text-orange-700 font-semibold uppercase tracking-[0.12em]">Construction ERP</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {visibleNav.map((item) => (
          <NavItemComponent key={item.label} item={item} pathname={pathname} onNavigate={handleNavigate} />
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-slate-200 p-3 bg-slate-50/50">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white flex items-center justify-center ring-2 ring-white shadow-sm font-semibold text-xs tracking-tight">
            {(() => {
              const name = session?.user?.name?.trim();
              if (name) {
                const initials = name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n) => n[0]!.toUpperCase())
                  .join("");
                return initials || <User className="w-4 h-4" />;
              }
              return <User className="w-4 h-4" />;
            })()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{session?.user?.name ?? "User"}</p>
            <p className="text-[10px] text-slate-500 truncate">{session?.user?.email ?? ""}</p>
            {(userType || roleKey) && (
              <p className="text-[9px] font-bold text-orange-700 uppercase tracking-wider truncate">
                {userType
                  ? (USER_TYPE_LABELS[userType] ?? userType.replace(/_/g, " "))
                  : roleKey!.replace(/_/g, " ")}
              </p>
            )}
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })}
            className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors" title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className={`hidden lg:flex flex-col bg-white border-r border-slate-200 transition-all duration-200 ${sidebarOpen ? "w-64" : "w-0 overflow-hidden"}`}>
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <aside className="fixed left-0 top-0 bottom-0 w-72 bg-white shadow-2xl z-50">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => { if (window.innerWidth < 1024) setMobileMenuOpen(true); else setSidebarOpen(!sidebarOpen); }}
              className="p-1.5 rounded-lg hover:bg-orange-50 hover:text-orange-700 text-slate-500 transition-colors">
              <Menu className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button className="relative p-2 rounded-lg hover:bg-orange-50 hover:text-orange-700 text-slate-500 transition-colors">
              <Bell className="w-5 h-5" />
              <span aria-hidden className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-orange-500 ring-2 ring-white" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
}
