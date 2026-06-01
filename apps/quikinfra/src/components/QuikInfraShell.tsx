"use client";

/**
 * QuikInfraShell — Self-contained app shell with sidebar navigation.
 */

import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { signOutAndClear } from "@/lib/auth/client-logout";
import { usePermissions } from "@/hooks/use-permissions";
import { UserAvatar } from "@/components/PageShell";
import {
  LayoutDashboard, Database, ShoppingCart, Warehouse,
  FolderKanban, CheckCircle2, FileBarChart2, Settings,
  Package, Building2, Truck, ClipboardList,
  FileText, BarChart3, Fuel, ArrowLeftRight,
  CalendarCheck, GitCompareArrows, HardHat, Hammer,
  Receipt, GanttChart, ListTodo, BadgeCheck, UserCog,
  ShieldCheck, Workflow, Globe, Boxes, MapPin,
  CreditCard, Calculator, FileSpreadsheet,
  ChevronRight, Menu, X, Search,
  LogOut, Users, MessageSquare,
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
  /**
   * When true, this item is visible ONLY to platform Super Admins
   * (userType === "SUPER_ADMIN"). Tenant Admins and lower roles never
   * see it, even with the `*` permission wildcard. Used for platform-
   * managed surfaces like Users and Workflows where MoreYeahs handles
   * provisioning on the client's behalf.
   */
  superAdminOnly?: boolean;
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
      { label: "Inspection/Checklist", href: "/quality",        iconComponent: ClipboardCheck, requiredPermission: "quality.read" },
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
      { label: "Users",     href: "/settings/users",     iconComponent: UserCog,     requiredPermission: "settings.users",     superAdminOnly: true },
      { label: "Workflows", href: "/settings/workflows", iconComponent: Workflow,    requiredPermission: "settings.workflows", superAdminOnly: true },
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
  isSuperAdmin: boolean,
  insideAllowedModule = false,
): NavItem[] {
  const out: NavItem[] = [];
  for (const item of items) {
    if (item.isSection) {
      out.push(item);
      continue;
    }
    // Platform-only items (Settings → Users / Workflows) are hidden from
    // every role except SUPER_ADMIN. Tenant admins with the `*` wildcard
    // still don't see these — provisioning is centralised on the
    // platform team.
    if (item.superAdminOnly && !isSuperAdmin) {
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
      const kids = filterNav(item.children, can, hasModule, canViewMenu, isSuperAdmin, nextInside);
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

/** Filter visible nav by menu label (parent or child). Sections with no matches are dropped. */
function filterNavBySearch(items: NavItem[], query: string): NavItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  const filtered: NavItem[] = [];
  for (const item of items) {
    if (item.isSection) {
      filtered.push(item);
      continue;
    }
    const labelMatch = item.label.toLowerCase().includes(q);
    if (item.children?.length) {
      const matchingChildren = labelMatch
        ? item.children
        : item.children.filter((c) => c.label.toLowerCase().includes(q));
      if (labelMatch || matchingChildren.length > 0) {
        filtered.push({ ...item, children: matchingChildren });
      }
      continue;
    }
    if (labelMatch) filtered.push(item);
  }

  const pruned: NavItem[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const it = filtered[i]!;
    if (it.isSection) {
      let hasContent = false;
      for (let j = i + 1; j < filtered.length; j++) {
        if (filtered[j]!.isSection) break;
        hasContent = true;
        break;
      }
      if (hasContent) pruned.push(it);
    } else {
      pruned.push(it);
    }
  }
  return pruned;
}

function NavRailItem({
  item,
  pathname,
  onNavigate,
  onExpand,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: (href: string) => void;
  onExpand: () => void;
}) {
  const Icon = item.iconComponent ?? LayoutDashboard;
  const isLeafActive =
    !!item.href &&
    (pathname === item.href || pathname.startsWith(item.href + "/"));
  const hasActiveChild = item.children?.some(
    (c) => c.href && (pathname === c.href || pathname.startsWith(c.href + "/")),
  );
  const active = !!(isLeafActive || hasActiveChild);

  const handleClick = () => {
    if (item.children?.length) {
      onExpand();
      return;
    }
    if (item.href) onNavigate(item.href);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={item.label}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#FFAF55] to-[#ea580c] text-white shadow-[0_4px_14px_rgba(249,115,22,0.35)]"
          : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
      }
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

// ─── Sidebar ────────────────────────────────────────────────────────

function NavItemComponent({ item, pathname, onNavigate, depth = 0, searchActive = false }: {
  item: NavItem; pathname: string; onNavigate: (href: string) => void; depth?: number; searchActive?: boolean;
}) {
  const [expanded, setExpanded] = useState(() => {
    if (!item.children) return false;
    return item.children.some(c => c.href && pathname.startsWith(c.href));
  });

  if (item.isSection) {
    return (
      <div className="px-3 pt-4 pb-2 first:pt-2 flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">{item.label}</span>
        <span aria-hidden className="flex-1 h-px bg-gray-200" />
      </div>
    );
  }

  const Icon = item.iconComponent;
  const isActive = item.href ? pathname === item.href || pathname.startsWith(item.href + "/") : false;
  const hasActiveChild = item.children?.some(c => c.href && (pathname === c.href || pathname.startsWith(c.href + "/")));

  if (item.children) {
    const isOpen = expanded || hasActiveChild || searchActive;
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all duration-150 ${
            hasActiveChild
              ? "text-slate-800 bg-slate-100"
              : expanded
                ? "text-slate-700 bg-slate-50"
                : "text-gray-500 hover:bg-slate-50 hover:text-slate-700"
          }`}
          aria-expanded={isOpen}
        >
          {Icon && (
            <Icon
              className={`w-4 h-4 shrink-0 transition-colors ${
                hasActiveChild
                  ? "text-slate-600"
                  : expanded
                    ? "text-slate-500"
                    : "text-gray-400 group-hover:text-gray-600"
              }`}
            />
          )}
          <span className="flex-1 text-left truncate" title={item.label}>{item.label}</span>
          {/* Single chevron with a 90° rotation animates smoothly
              between collapsed (right-pointing) and open
              (down-pointing) — replaces the previous two-icon swap
              which was instantaneous. */}
          <ChevronRight
            className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform duration-200 ${
              isOpen ? "rotate-90" : ""
            }`}
          />
        </button>
        {isOpen && (
          <div className="ml-[18px] mt-1 mb-1 space-y-0.5 border-l border-gray-100 pl-3">
            {item.children.map((child) => (
              <NavItemComponent key={child.label} item={child} pathname={pathname} onNavigate={onNavigate} depth={depth + 1} searchActive={searchActive} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const activeRowClass =
    "w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all duration-150 bg-gradient-to-b from-[#FFAF55] to-[#ea580c] text-white shadow-[0_4px_14px_rgba(249,115,22,0.35)]";

  return (
    <button
      onClick={() => item.href && onNavigate(item.href)}
      className={
        isActive
          ? `group relative ${activeRowClass}`
          : "group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium text-gray-500 transition-all duration-150 hover:bg-slate-50 hover:text-slate-800"
      }
    >
      {Icon && (
        <Icon
          className={`w-4 h-4 shrink-0 transition-colors ${
            isActive ? "text-white" : "text-gray-400 group-hover:text-gray-600"
          }`}
        />
      )}
      <span className="flex-1 text-left truncate" title={item.label}>{item.label}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span
          className={
            isActive
              ? "bg-white/25 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              : "bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm"
          }
        >
          {item.badge}
        </span>
      )}
    </button>
  );
}

// ─── Main Shell ─────────────────────────────────────────────────────

export function QuikInfraShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const { can, hasModule, canViewMenu, isLoading: permsLoading, roleKey, userType } = usePermissions();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navSearch, setNavSearch] = useState("");
  const [focusNavSearch, setFocusNavSearch] = useState(false);
  const navSearchRef = useRef<HTMLInputElement>(null);

  // Platform-only nav items (Settings → Users / Workflows) are gated on
  // the user's PDF-spec userType being exactly SUPER_ADMIN. Tenant admins
  // do NOT qualify, so they don't see those rows in the sidebar.
  const isSuperAdmin = userType === "SUPER_ADMIN";

  // Filter nav by the user's permission set + module whitelist + saved
  // permission matrix. While permissions are loading show the full nav
  // to avoid a flash of empty sidebar — once /api/me responds we hide
  // what the user can't see.
  const visibleNav = useMemo(
    () =>
      permsLoading
        ? CONSTRUCTION_NAV
        : filterNav(CONSTRUCTION_NAV, can, hasModule, canViewMenu, isSuperAdmin),
    [permsLoading, can, hasModule, canViewMenu, isSuperAdmin]
  );

  const displayNav = useMemo(
    () => filterNavBySearch(visibleNav, navSearch),
    [visibleNav, navSearch],
  );

  const searchActive = navSearch.trim().length > 0;

  useEffect(() => {
    if (!focusNavSearch || !sidebarOpen) return;
    const t = window.setTimeout(() => {
      navSearchRef.current?.focus();
      setFocusNavSearch(false);
    }, 200);
    return () => window.clearTimeout(t);
  }, [focusNavSearch, sidebarOpen]);

  const handleNavigate = (href: string) => {
    router.push(href);
    setMobileMenuOpen(false);
  };

  const expandedSidebarInner = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-4 sm:px-4 sm:py-5">
        <button
          type="button"
          onClick={() => {
            setSidebarOpen(false);
            setMobileMenuOpen(false);
          }}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1 pl-0.5 pr-2 text-left transition-colors hover:bg-slate-50"
          aria-label="Collapse sidebar"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/quikinfra.svg"
            alt="Quik Infra"
            className="h-10 w-10 shrink-0 rounded-xl object-contain"
          />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold tracking-tight text-slate-900">Quik Infra</h1>
            <p className="truncate text-xs text-gray-500">Construction ERP</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="shrink-0 rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            ref={navSearchRef}
            type="text"
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
            placeholder="Search menu…"
            aria-label="Search navigation"
            className="w-full rounded-xl border border-gray-200 bg-slate-50/80 py-2 pl-9 pr-8 text-sm text-slate-800 placeholder:text-gray-400 transition-colors focus:border-orange-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-100"
          />
          {navSearch ? (
            <button
              type="button"
              onClick={() => setNavSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-gray-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-1">
        {displayNav.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-gray-400">No menu items match your search</p>
        ) : (
          displayNav.map((item) => (
            <NavItemComponent
              key={item.label + (item.href ?? "")}
              item={item}
              pathname={pathname}
              onNavigate={handleNavigate}
              searchActive={searchActive}
            />
          ))
        )}
      </nav>

      <div className="border-t border-gray-100 bg-white p-4">
        <div className="flex items-center gap-3">
          <UserAvatar src={session?.user?.image} name={session?.user?.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{session?.user?.name ?? "User"}</p>
            {(userType || roleKey) && (
              <p className="truncate text-xs text-gray-500">
                {userType
                  ? (USER_TYPE_LABELS[userType] ?? userType.replace(/_/g, " "))
                  : roleKey!.replace(/_/g, " ")}
              </p>
            )}
            {session?.user?.email ? (
              <p
                className={`truncate text-xs ${(userType || roleKey) ? "mt-0.5 text-gray-400" : "text-gray-500"}`}
              >
                {session.user.email}
              </p>
            ) : null}
          </div>
          <button onClick={() => signOutAndClear("/login")}
            className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors" title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  const collapsedRailInner = (
    <div className="flex h-full min-h-0 flex-col items-center px-1 py-3">
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        aria-label="Expand sidebar"
        title="Expand sidebar"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/quikinfra.svg"
          alt="Quik Infra"
          className="h-11 w-11 rounded-xl object-contain"
        />
      </button>
      <button
        type="button"
        onClick={() => {
          setSidebarOpen(true);
          setFocusNavSearch(true);
        }}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        aria-label="Search menu"
        title="Search menu"
      >
        <Search className="h-5 w-5" />
      </button>
      <div className="mx-auto my-2 h-px w-7 shrink-0 bg-gray-100" aria-hidden />
      <nav className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto py-1">
        {visibleNav.map((item, i) =>
          item.isSection ? (
            <div key={`rail-sep-${item.label}-${i}`} className="mx-auto my-1.5 h-px w-7 shrink-0 bg-gray-100" aria-hidden />
          ) : (
            <NavRailItem
              key={item.label}
              item={item}
              pathname={pathname}
              onNavigate={handleNavigate}
              onExpand={() => setSidebarOpen(true)}
            />
          ),
        )}
      </nav>
      <div className="mx-auto my-2 h-px w-7 shrink-0 bg-gray-100" aria-hidden />
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="flex shrink-0 rounded-full ring-2 ring-white/80 transition-opacity hover:opacity-90"
        aria-label="Expand sidebar for profile and sign out"
        title={session?.user?.name ?? "Profile"}
      >
        <UserAvatar src={session?.user?.image} name={session?.user?.name} className="h-10 w-10" />
      </button>
    </div>
  );

  const sidebarContent = expandedSidebarInner;

  return (
    <div className="flex h-screen min-h-0 bg-gray-100">
      <aside
        className={`hidden lg:flex shrink-0 flex-col overflow-hidden transition-all duration-200 ease-out ${
          sidebarOpen ? "w-[17rem] py-4 pl-4" : "w-[5rem] py-4 pl-4"
        }`}
      >
        <div
          className={`flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(15,23,42,0.06)] transition-[width] duration-200 ease-out ${
            sidebarOpen ? "w-64" : "w-14"
          }`}
        >
          {sidebarOpen ? expandedSidebarInner : collapsedRailInner}
        </div>
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <aside className="fixed left-3 top-3 bottom-3 w-[min(18rem,calc(100vw-1.5rem))] bg-white rounded-3xl border border-gray-100 shadow-2xl z-50 overflow-hidden flex flex-col">
            {sidebarContent}
          </aside>
        </div>
      )}

      {!mobileMenuOpen && (
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="fixed bottom-5 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-slate-600 shadow-lg hover:bg-slate-50 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>
      )}

      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col py-4 pr-4 pl-4 ${sidebarOpen ? "lg:pl-3" : "lg:pl-4"}`}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(15,23,42,0.04)]">
          <main className="min-h-0 flex-1 overflow-y-auto bg-white">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
