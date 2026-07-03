"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, Star, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { useSidebar } from "@/components/layout/sidebar-context";
import { useI18n } from "@/lib/i18n";
import { navigationGroups, type NavItem } from "@/lib/modules";
import { useNavPrefs } from "@/lib/hooks/use-nav-prefs";
import { useEnabledModules } from "@/lib/hooks/use-enabled-modules";
import { destByHref } from "@/lib/nav";
import { cn } from "@/lib/utils/cn";

/** Floating label shown beside an icon-only item while the sidebar is collapsed. */
function CollapsedTooltip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
    >
      {label}
    </span>
  );
}

function SidebarLink({
  item,
  collapsed,
  onNavigate,
  nested = false,
  favoritable = false
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
  nested?: boolean;
  favoritable?: boolean;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { isFavorite, toggleFavorite } = useNavPrefs();
  const Icon = item.icon;
  const href = item.href ?? "#";
  const active = pathname === href;
  const label = t(`nav.items.${item.title}`, item.title);
  const fav = favoritable && item.href ? isFavorite(item.href) : false;

  return (
    <div className="group relative">
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? label : undefined}
        className={cn(
          "flex h-9 items-center rounded-xl text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          collapsed ? "justify-center px-0" : "gap-3 px-3",
          nested && !collapsed ? "pl-11 text-[13px]" : "",
          active ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed ? <span className="flex-1 truncate">{label}</span> : null}
      </Link>
      {favoritable && !collapsed && item.href ? (
        <button
          type="button"
          aria-label={fav ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
          onClick={(e) => { e.preventDefault(); toggleFavorite(item.href!); }}
          className={cn(
            "absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring",
            fav ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            active ? "text-primary" : "text-muted-foreground hover:text-amber-500"
          )}
        >
          <Star className={cn("h-3.5 w-3.5", fav && "fill-amber-400 text-amber-400")} />
        </button>
      ) : null}
      {collapsed ? <CollapsedTooltip label={label} /> : null}
    </div>
  );
}

/** Favorites + Recent quick-access sections (shown only when expanded). */
function QuickAccess({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const { favorites, recents } = useNavPrefs();
  const favItems = favorites.map((h) => destByHref(h)).filter(Boolean);
  const recentItems = recents.map((h) => destByHref(h)).filter((d) => d && !favorites.includes(d.href)).slice(0, 5);

  if (favItems.length === 0 && recentItems.length === 0) return null;

  return (
    <>
      {favItems.length ? (
        <div>
          <p className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />{t("nav.favorites", "Favorites")}
          </p>
          <div className="mt-1 space-y-1">
            {favItems.map((d) => <SidebarLink key={d!.href} item={{ title: d!.title, href: d!.href, icon: d!.icon }} collapsed={false} onNavigate={onNavigate} favoritable />)}
          </div>
        </div>
      ) : null}
      {recentItems.length ? (
        <div>
          <p className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <Clock className="h-3 w-3" />{t("nav.recent", "Recent")}
          </p>
          <div className="mt-1 space-y-1">
            {recentItems.map((d) => <SidebarLink key={d!.href} item={{ title: d!.title, href: d!.href, icon: d!.icon }} collapsed={false} onNavigate={onNavigate} favoritable />)}
          </div>
        </div>
      ) : null}
    </>
  );
}

function SidebarGroupItem({
  item,
  collapsed,
  onNavigate
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { setCollapsed } = useSidebar();
  const Icon = item.icon;
  const label = t(`nav.items.${item.title}`, item.title);
  const children = item.children ?? [];
  const childActive = children.some((child) => child.href && pathname === child.href);
  const [open, setOpen] = useState(childActive);

  // Keep the active branch open as the route changes.
  useEffect(() => {
    if (childActive) {
      setOpen(true);
    }
  }, [childActive]);

  const submenuId = `sidebar-submenu-${item.title.replace(/\s+/g, "-").toLowerCase()}`;

  // Collapsed: render a single icon. Clicking expands the sidebar and opens the branch.
  if (collapsed) {
    return (
      <div className="group relative">
        <button
          type="button"
          aria-label={label}
          onClick={() => {
            setCollapsed(false);
            setOpen(true);
          }}
          className={cn(
            "flex h-10 w-full items-center justify-center rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            childActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Icon className="h-5 w-5 shrink-0" />
        </button>
        <CollapsedTooltip label={label} />
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={submenuId}
        onClick={() => setOpen((previous) => !previous)}
        className={cn(
          "flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          childActive ? "text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="flex-1 truncate text-left">{label}</span>
        <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform duration-200", open && "rotate-90")} />
      </button>
      {/* grid-rows 0fr -> 1fr animates height without a fixed pixel value */}
      <div
        id={submenuId}
        role="group"
        aria-label={label}
        className={cn("grid transition-[grid-template-rows] duration-300 ease-in-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
      >
        <div className="overflow-hidden">
          <div className="mt-1 space-y-1">
            {children.map((child) => (
              <SidebarLink key={child.href ?? child.title} item={child} collapsed={false} onNavigate={onNavigate} nested />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A top-level navigation group. Collapsible (with persisted state) when the sidebar is expanded. */
function SidebarGroup({
  group,
  collapsed,
  onNavigate
}: {
  group: (typeof navigationGroups)[number];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { collapsedGroups, toggleGroup, openGroup } = useSidebar();

  const containsActive = group.items.some(
    (item) =>
      (item.href && pathname === item.href) ||
      (item.children?.some((child) => child.href && pathname === child.href) ?? false)
  );

  // Auto-open the group that holds the active route when the route changes.
  useEffect(() => {
    if (containsActive) {
      openGroup(group.label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, containsActive]);

  const renderItems = () =>
    group.items.map((item) =>
      item.children?.length ? (
        <SidebarGroupItem key={item.title} item={item} collapsed={collapsed} onNavigate={onNavigate} />
      ) : (
        <SidebarLink key={item.href ?? item.title} item={item} collapsed={collapsed} onNavigate={onNavigate} favoritable />
      )
    );

  // Icon-only mode: keep every item reachable; group headers are not shown.
  if (collapsed) {
    return (
      <div>
        <div className="mx-auto mb-1 h-px w-6 bg-border" aria-hidden="true" />
        <div className="space-y-1">{renderItems()}</div>
      </div>
    );
  }

  const open = !collapsedGroups.includes(group.label);
  const groupId = `sidebar-group-${group.label.replace(/\s+/g, "-").toLowerCase()}`;
  const label = t(`nav.groups.${group.label}`, group.label);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={groupId}
        onClick={() => toggleGroup(group.label)}
        className="flex w-full items-center justify-between rounded-md px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", open ? "" : "-rotate-90")} />
      </button>
      <div
        id={groupId}
        role="group"
        aria-label={label}
        className={cn("grid transition-[grid-template-rows] duration-300 ease-in-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
      >
        <div className="overflow-hidden">
          <div className="mt-1 space-y-1">{renderItems()}</div>
        </div>
      </div>
    </div>
  );
}

/** The scrollable group/item list. Shared by the desktop sidebar and the mobile drawer. */
export function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { hiddenHrefs } = useEnabledModules();

  // Drop nav items for modules disabled in Settings → General (and any group left empty).
  const groups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => (item.children?.length ? { ...item, children: item.children.filter((c) => !c.href || !hiddenHrefs.has(c.href)) } : item))
        .filter((item) => (item.children ? item.children.length > 0 : !(item.href && hiddenHrefs.has(item.href))))
    }))
    .filter((group) => group.items.length > 0);

  return (
    <nav aria-label="Primary" className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 py-4">
      {!collapsed ? <QuickAccess onNavigate={onNavigate} /> : null}
      {groups.map((group) => (
        <SidebarGroup key={group.label} group={group} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

/** Desktop sidebar — collapsible, sticky, width-animated. Hidden below `lg`. */
export function Sidebar() {
  const { collapsed, toggleCollapsed, mounted } = useSidebar();
  const [hovered, setHovered] = useState(false);
  // Expand on hover while pinned-collapsed (Linear/VSCode behaviour).
  const expanded = !collapsed || hovered;
  const showCollapsed = !expanded;

  return (
    <aside
      aria-label="Sidebar"
      data-collapsed={showCollapsed}
      onMouseEnter={() => collapsed && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r bg-card lg:flex",
        expanded ? "w-[260px]" : "w-[72px]",
        collapsed && hovered ? "shadow-lg" : "",
        mounted ? "transition-[width] duration-200 ease-in-out" : ""
      )}
    >
      <div className="flex h-16 shrink-0 items-center border-b px-3">
        {expanded ? (
          <Link href="/" className="flex items-center gap-2 overflow-hidden" aria-label="QuikFinance home">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">QF</span>
            <span className="truncate text-base font-bold">QuikFinance</span>
          </Link>
        ) : null}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Pin sidebar open" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            expanded ? "ml-auto" : "mx-auto"
          )}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>
      <SidebarNav collapsed={showCollapsed} />
    </aside>
  );
}
