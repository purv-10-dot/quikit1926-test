"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  User,
  Clock,
  Star,
  AppWindow,
  Map,
  LayoutGrid,
  ChevronRight,
  LayoutDashboard,
  Settings as SettingsIcon,
  Users,
  Headphones,
  ExternalLink,
  Plus,
  MoreHorizontal,
  Sliders,
  List as ListIcon,
  BarChart3,
  TrendingUp,
  Gauge,
  ClipboardList,
  PieChart,
} from "lucide-react";
import { ComingSoonRow } from "./coming-soon-row";
import { FiltersSection } from "./filters-section";
import { MoreSpacesPopover } from "./more-spaces-popover";
import { PlansPopover } from "./plans-popover";
import { RecentPopover } from "./recent-popover";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import { SpaceIcon } from "@/components/space-icon";

interface NavRowProps {
  href?: string;
  icon: React.ElementType;
  label: string;
  active?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  trailing?: React.ReactNode;
  external?: boolean;
  indent?: boolean;
}

function NavRow({
  href,
  icon: Icon,
  label,
  active,
  expandable,
  expanded,
  onToggle,
  trailing,
  external,
  indent,
}: NavRowProps) {
  const base = `qt-nav-row flex items-center gap-2 px-3 ${indent ? "pl-9" : ""} h-8 text-sm rounded ${active ? "qt-nav-row--active bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-100"
    }`;

  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {expandable && (
        <ChevronRight
          className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      )}
      {trailing}
      {external && <ExternalLink className="h-3 w-3 text-gray-400" />}
    </>
  );

  if (expandable) {
    return (
      <button onClick={onToggle} className={`${base} w-full text-left`}>
        {content}
      </button>
    );
  }

  if (!href) {
    return <div className={base}>{content}</div>;
  }

  return (
    <Link href={href} className={base} target={external ? "_blank" : undefined}>
      {content}
    </Link>
  );
}

interface SpaceItem {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  projectKey?: string;
  /**
   * A discovery (JPD-style) idea space drives the nested "All ideas" row.
   * `templateKey` is the reliable discriminator (the create form always sends
   * "discovery"); `projectType` can be overridden, so we check both.
   */
  projectType?: string;
  templateKey?: string;
  starred?: boolean;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const perms = useMyPermissions();
  // While the perm fetch is in flight, render the full sidebar (avoids a
  // flash of empty nav on first paint). Once loaded, filter by hasNav.
  const canSee = (key: string) => perms.loading || perms.hasNav(key);
  // Reports are restricted to org admins (all data) and Space Admins (their own
  // projects). Regular members — even with a Report:view grant — don't see them.
  const canSeeReports = perms.loading || perms.isAdmin || perms.isSpaceAdmin;
  const [recentOpen, setRecentOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const plansAnchorRef = useRef<HTMLDivElement | null>(null);
  const [spacesOpen, setSpacesOpen] = useState(true);
  const [opsOpen, setOpsOpen] = useState(true);
  const [dashboardsOpen, setDashboardsOpen] = useState(true);
  const [reportsOpen, setReportsOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const recentRowRef = useRef<HTMLDivElement>(null);
  const [recentSpaces, setRecentSpaces] = useState<SpaceItem[]>([]);
  // Discovery spaces expand in-place to reveal their nested "All ideas" view
  // (JPD-style). Track which ones are open; the active space auto-expands once.
  const [openSpaceIds, setOpenSpaceIds] = useState<Set<string>>(new Set());
  const toggleSpaceOpen = (id: string) =>
    setOpenSpaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Full space list (used for both the Recent slice AND the Starred group —
  // a starred space might sit past the recent top-8).
  const [allSpaces, setAllSpaces] = useState<SpaceItem[]>([]);

  useEffect(() => {
    let alive = true;
    // Sort by most-recently-updated so the "Recent" list actually reflects
    // recent activity (the API defaults to name-asc, which buried spaces like
    // late-alphabet discovery projects past the top-8 slice).
    function load() {
      fetch("/api/projects?sort=updatedAt&order=desc&pageSize=100")
        .then((r) => r.json())
        .then((j) => {
          if (!alive || !j?.success) return;
          const items: SpaceItem[] = (j.data ?? []).map((p: SpaceItem) => ({
            id: p.id,
            name: p.name,
            icon: p.icon,
            color: p.color,
            projectKey: p.projectKey,
            projectType: p.projectType,
            templateKey: p.templateKey,
            starred: p.starred,
          }));
          setAllSpaces(items);
          setRecentSpaces(items.slice(0, 8));
        })
        .catch(() => undefined);
    }
    load();
    // Re-pull when a star is toggled anywhere (Projects list / space header) so
    // the Starred group stays in sync without a page reload.
    window.addEventListener("quiktrack:stars-changed", load);
    return () => {
      alive = false;
      window.removeEventListener("quiktrack:stars-changed", load);
    };
  }, []);

  const starredSpaces = allSpaces.filter((s) => s.starred);

  // Renders one space row (flat link, or a discovery space that expands to its
  // nested "All ideas"). Shared by the Starred + Recent groups so they behave
  // identically. `keyPrefix` keeps React keys unique across the two groups.
  function renderSpaceRow(s: SpaceItem, keyPrefix: string) {
    const isCurrent = s.id === activeSpaceId;
    const isDiscovery = s.templateKey === "discovery" || s.projectType === "discovery";
    const seg = s.projectKey ?? s.id;
    const spaceHref = `/spaces/${seg}/${isDiscovery ? "ideas" : "backlog"}`;
    const rowClass = `qt-nav-row flex items-center gap-2 px-3 h-8 text-sm rounded ${
      isCurrent
        ? "qt-nav-row--active bg-blue-50 text-blue-700 font-medium"
        : "text-gray-700 hover:bg-gray-100"
    }`;
    if (!isDiscovery) {
      return (
        <Link key={`${keyPrefix}-${s.id}`} href={spaceHref} className={rowClass}>
          <SpaceIcon icon={s.icon} name={s.name} color={s.color} size={20} radius={6} />
          <span className="flex-1 truncate">{s.name}</span>
        </Link>
      );
    }
    const open = openSpaceIds.has(s.id);
    const ideasHref = `/spaces/${seg}/ideas`;
    const ideasActive = pathname === ideasHref;
    const parentActive = isCurrent && !ideasActive;
    const parentRowClass = `qt-nav-row group flex items-center gap-2 px-3 h-8 text-sm rounded ${
      parentActive
        ? "qt-nav-row--active bg-blue-50 text-blue-700 font-medium"
        : "text-gray-700 hover:bg-gray-100"
    }`;
    return (
      <div key={`${keyPrefix}-${s.id}`}>
        <div className={parentRowClass}>
          <button
            type="button"
            onClick={() => toggleSpaceOpen(s.id)}
            className="relative h-5 w-5 shrink-0"
            aria-label={open ? "Collapse" : "Expand"}
          >
            <span
              className={`absolute inset-0 flex items-center justify-center transition-opacity ${open ? "opacity-0" : "opacity-100 group-hover:opacity-0"}`}
            >
              <SpaceIcon icon={s.icon} name={s.name} color={s.color} size={20} radius={6} />
            </span>
            <span
              className={`absolute inset-0 flex items-center justify-center rounded hover:bg-gray-200 transition-opacity ${open ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            >
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
            </span>
          </button>
          <Link href={spaceHref} className="flex items-center flex-1 min-w-0">
            <span className="flex-1 truncate">{s.name}</span>
          </Link>
        </div>
        {open && (
          <Link
            href={ideasHref}
            className={`qt-nav-row flex items-center gap-2 pl-9 pr-3 h-7 text-sm rounded ${
              ideasActive
                ? "qt-nav-row--active bg-blue-50 text-blue-700 font-medium"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span aria-hidden>👋</span>
            <span className="flex-1 truncate">All ideas</span>
          </Link>
        )}
      </div>
    );
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // Extract the currently-viewed space id from the URL so the matching row in
  // the Recent list can be highlighted and pinned to the top. Pathnames look
  // like `/spaces/<id>/board` or `/spaces/<id>/settings/...`.
  const activeSpaceId = (() => {
    const m = pathname?.match(/^\/spaces\/([^/]+)/);
    return m ? m[1] : null;
  })();

  // Auto-expand the space you're currently in so its nested view is visible.
  // Runs once per active space; the user can still collapse it manually after.
  useEffect(() => {
    if (!activeSpaceId) return;
    setOpenSpaceIds((prev) =>
      prev.has(activeSpaceId) ? prev : new Set(prev).add(activeSpaceId),
    );
  }, [activeSpaceId]);

  const orderedRecentSpaces = (() => {
    if (!activeSpaceId) return recentSpaces;
    const idx = recentSpaces.findIndex((s) => s.id === activeSpaceId);
    if (idx <= 0) return recentSpaces;
    const next = recentSpaces.slice();
    const [active] = next.splice(idx, 1);
    next.unshift(active);
    return next;
  })();

  return (
    <aside
      data-tour="sidebar"
      className="qt-sidebar w-[232px] shrink-0 border-r border-gray-200 bg-white flex flex-col h-full overflow-y-auto overscroll-contain"
    >
      <nav className="flex-1 py-2">
        <div className="px-2 space-y-0.5">
          {canSee("home") && (
            <NavRow href="/dashboard" icon={User} label="For you" active={pathname === "/dashboard"} />
          )}
          {/* TODO: Recent + Plans + Starred + Apps — coming soon. Restore when ready.
          <div ref={recentRowRef}>
            <NavRow
              icon={Clock}
              label="Recent"
              expandable
              expanded={recentOpen}
              onToggle={() => setRecentOpen((v) => !v)}
            />
          </div>
          <RecentPopover
            anchorRef={recentRowRef}
            open={recentOpen}
            onClose={() => setRecentOpen(false)}
          />
          <ComingSoonRow icon={Star} label="Starred" description="Star projects, dashboards, and views to pin them here." />
          <ComingSoonRow icon={AppWindow} label="Apps" description="Browse and install apps that extend QuikTrack." />
          {canSee("plans") && (
            <div ref={plansAnchorRef} className="relative">
              <NavRow
                href="/plans"
                icon={Map}
                label="Plans"
                expandable
                expanded={plansOpen}
                onToggle={() => setPlansOpen((v) => !v)}
              />
              {plansOpen && (
                <PlansPopover
                  anchorRef={plansAnchorRef}
                  onClose={() => setPlansOpen(false)}
                />
              )}
            </div>
          )}
          */}
          {canSee("spaces") && (
          <>
          <button
            type="button"
            data-tour="spaces"
            onClick={() => setSpacesOpen((v) => !v)}
            className={`qt-nav-row w-full flex items-center gap-2 px-3 h-8 text-sm rounded text-left ${isActive("/spaces") && spacesOpen
                ? "qt-nav-row--active bg-blue-50 text-blue-700 font-medium"
                : "text-gray-700 hover:bg-gray-100"
              }`}
          >
            {spacesOpen ? (
              <LayoutGrid className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            <span className="flex-1 truncate">Projects</span>
            <span className="flex items-center">
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  router.push("/spaces/templates");
                }}
                className="p-0.5 rounded hover:bg-gray-200 inline-flex"
                aria-label="Create project"
              >
                <Plus className="h-3.5 w-3.5 text-gray-400 hover:text-gray-700" />
              </span>
            </span>
          </button>
          {spacesOpen && (
            <>
              {/* Starred group — the user's favourite spaces, pinned above
                  Recent (Jira-style). Populated from the per-user star flag. */}
              {starredSpaces.length > 0 && (
                <div className="pt-1 pb-1">
                  <div className="px-3 pb-1 text-[11px] font-medium text-gray-500 uppercase">
                    Starred
                  </div>
                  <div className="space-y-0.5">
                    {starredSpaces.map((s) => renderSpaceRow(s, "starred"))}
                  </div>
                </div>
              )}
              {orderedRecentSpaces.length > 0 && (
                <div className="pt-1 pb-1">
                  <div className="px-3 pb-1 text-[11px] font-medium text-gray-500 uppercase">
                    Recent
                  </div>
                  <div className="space-y-0.5">
                    {orderedRecentSpaces.slice(0, 5).map((s) => renderSpaceRow(s, "recent"))}
                  </div>
                </div>
              )}
              <button
                ref={moreBtnRef}
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                className={`qt-nav-row w-full flex items-center gap-2 px-3 h-8 text-sm rounded text-left ${moreOpen
                    ? "qt-nav-row--active bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-700 hover:bg-gray-100"
                  }`}
              >
                <ListIcon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">More projects</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          </>
          )}
        </div>

        <div className="my-2" />

        <div className="px-2 space-y-0.5">
          <FiltersSection />
          {canSee("dashboards") && (
          <NavRow
            href="/dashboards"
            icon={Gauge}
            label="Dashboards"
            expandable
            expanded={dashboardsOpen}
            onToggle={() => setDashboardsOpen((v) => !v)}
          />
          )}
          {canSee("dashboards") && dashboardsOpen && (
            <div className=" pr-2 space-y-1.5 mb-1">
              {/* <div className="text-[10px] font-semibold uppercase tracking-wsider text-gray-400 mt-1">
                Starred
              </div> */}
              {/* <NavRow
                href="/dashboards/dqf"
                icon={LayoutDashboard}
                label="dqf"
                indent
              />
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-2">
                Recent
              </div> */}
              <NavRow
                href="/dashboards/default"
                icon={PieChart}
                label="Default dashboard"
                active={pathname === "/dashboards/default"}
                indent
              />
              <div className="my-1.5" />
              {/* <NavRow
                href="/dashboards"
                icon={LayoutDashboard}
                label="View all dashboards"
                indent
              /> */}
            </div>
          )}
          {/* Org-level "Apps" tree removed from the sidebar per product. Kept the
              AppsSection component + "apps" nav gating intact in case it's
              restored; per-project QuikTest access is the space's own "Tests" tab.
          {canSee("apps") && <AppsSection />} */}
          {canSee("timesheet") && perms.isAdmin && (
            <span data-tour="timesheet">
              <NavRow href="/timesheet" icon={Clock} label="Timesheet" active={isActive("/timesheet")} />
            </span>
          )}
          {canSeeReports && (
            <span data-tour="reports">
              <NavRow
                icon={BarChart3}
                label="Reports"
                expandable
                expanded={reportsOpen}
                onToggle={() => setReportsOpen((v) => !v)}
              />
            </span>
          )}
          {canSeeReports && reportsOpen && (
            <div className="pr-2 space-y-1.5 mb-1">
              <NavRow
                href="/reports"
                icon={ClipboardList}
                label="Project Report"
                active={pathname === "/reports"}
                indent
              />
              {(perms.isAdmin || perms.isSpaceAdmin) && (
                <NavRow
                  href="/reports/resource"
                  icon={Users}
                  label="Resource Report"
                  active={isActive("/reports/resource")}
                  indent
                />
              )}
              <NavRow
                href="/reports/executive"
                icon={TrendingUp}
                label="Executive Report"
                active={isActive("/reports/executive")}
                indent
              />
            </div>
          )}
          {/* TODO: coming soon — Operations / Customers / Customer experiences.
              Restore the full subtree once these modules are implemented.
          <NavRow
            icon={SettingsIcon}
            label="Operations"
            expandable
            expanded={opsOpen}
            onToggle={() => setOpsOpen((v) => !v)}
            trailing={<MoreHorizontal className="h-3.5 w-3.5 text-gray-400" />}
          />
          {opsOpen && (
            <>
              <ComingSoonRow icon={LayoutDashboard} label="Home" indent description="Operations home — incident overview and on-call status." />
              <ComingSoonRow icon={Star} label="Alerts" indent description="Configure and triage operational alerts." />
              <ComingSoonRow icon={Headphones} label="On-call schedules" indent description="Manage on-call rotations and escalation policies." />
            </>
          )}
          <ComingSoonRow icon={User} label="Customers" description="Track customer accounts linked to your projects." />
          <ComingSoonRow icon={Users} label="Customer experiences" description="Customer-facing portals and feedback flows." />
          */}
        </div>

        <div className="my-2" />
{/* 
        <div className="px-2 space-y-0.5">
          <NavRow href="https://confluence" icon={Map} label="Confluence" external />
          <NavRow href="/teams" icon={Users} label="Teams" external />
        </div> */}
      </nav>

      {/* <div className="border-t border-gray-200 px-2 py-2">
        <NavRow icon={Sliders} label="Customize sidebar" />
      </div> */}
      <MoreSpacesPopover
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        anchorRef={moreBtnRef}
      />
    </aside>
  );
}
