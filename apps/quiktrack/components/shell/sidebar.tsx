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
} from "lucide-react";
import { ComingSoonRow } from "./coming-soon-row";
import { FiltersSection } from "./filters-section";
import { MoreSpacesPopover } from "./more-spaces-popover";
import { PlansPopover } from "./plans-popover";
import { RecentPopover } from "./recent-popover";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";

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
  const base = `flex items-center gap-2 px-3 ${indent ? "pl-9" : ""} h-8 text-sm rounded ${active ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-100"
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
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const perms = useMyPermissions();
  // While the perm fetch is in flight, render the full sidebar (avoids a
  // flash of empty nav on first paint). Once loaded, filter by hasNav.
  const canSee = (key: string) => perms.loading || perms.hasNav(key);
  const [recentOpen, setRecentOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const plansAnchorRef = useRef<HTMLDivElement | null>(null);
  const [spacesOpen, setSpacesOpen] = useState(true);
  const [opsOpen, setOpsOpen] = useState(true);
  const [dashboardsOpen, setDashboardsOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const recentRowRef = useRef<HTMLDivElement>(null);
  const [recentSpaces, setRecentSpaces] = useState<SpaceItem[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/projects")
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j?.success) return;
        setRecentSpaces(
          (j.data ?? []).slice(0, 8).map((p: SpaceItem) => ({
            id: p.id,
            name: p.name,
            icon: p.icon,
            color: p.color,
            projectKey: p.projectKey,
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // Extract the currently-viewed space id from the URL so the matching row in
  // the Recent list can be highlighted and pinned to the top. Pathnames look
  // like `/spaces/<id>/board` or `/spaces/<id>/settings/...`.
  const activeSpaceId = (() => {
    const m = pathname?.match(/^\/spaces\/([^/]+)/);
    return m ? m[1] : null;
  })();

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
      className="w-[232px] shrink-0 border-r border-gray-200 bg-white flex flex-col h-[calc(100vh-48px)] overflow-y-auto"
    >
      <nav className="flex-1 py-2">
        <div className="px-2 space-y-0.5">
          {canSee("home") && (
            <NavRow href="/" icon={User} label="For you" active={isActive("/")} />
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
          <ComingSoonRow icon={Star} label="Starred" description="Star spaces, dashboards, and views to pin them here." />
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
            className={`w-full flex items-center gap-2 px-3 h-8 text-sm rounded text-left ${isActive("/spaces") && spacesOpen
                ? "bg-blue-50 text-blue-700 font-medium"
                : "text-gray-700 hover:bg-gray-100"
              }`}
          >
            {spacesOpen ? (
              <LayoutGrid className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            <span className="flex-1 truncate">Spaces</span>
            <span className="flex items-center gap-1">
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  router.push("/spaces/templates");
                }}
                className="p-0.5 rounded hover:bg-gray-200 inline-flex"
                aria-label="Create space"
              >
                <Plus className="h-3.5 w-3.5 text-gray-400 hover:text-gray-700" />
              </span>
              <MoreHorizontal className="h-3.5 w-3.5 text-gray-400 hover:text-gray-700" />
            </span>
          </button>
          {spacesOpen && (
            <>
              {orderedRecentSpaces.length > 0 && (
                <div className="pt-1 pb-1">
                  <div className="px-3 pb-1 text-[11px] font-medium text-gray-500 uppercase">
                    Recent
                  </div>
                  <div className="space-y-0.5">
                    {orderedRecentSpaces.slice(0, 5).map((s) => {
                      const isCurrent = s.id === activeSpaceId;
                      return (
                        <Link
                          key={`recent-${s.id}`}
                          href={`/spaces/${s.id}/board`}
                          className={`flex items-center gap-2 px-3 h-8 text-sm rounded ${isCurrent
                              ? "bg-blue-50 text-blue-700 font-medium"
                              : "text-gray-700 hover:bg-gray-100"
                            }`}
                        >
                          {s.icon ? (
                            <span className="h-5 w-5 flex items-center justify-center text-base shrink-0 leading-none">
                              {s.icon}
                            </span>
                          ) : (
                            <span
                              className="h-4 w-4 rounded-sm flex items-center justify-center text-[10px] text-white font-semibold shrink-0"
                              style={{ background: s.color || "#2563eb" }}
                            >
                              {s.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <span className="flex-1 truncate">{s.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
              <button
                ref={moreBtnRef}
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                className={`w-full flex items-center gap-2 px-3 h-8 text-sm rounded text-left ${moreOpen
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-700 hover:bg-gray-100"
                  }`}
              >
                <ListIcon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">More spaces</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          </>
          )}
        </div>

        <div className="my-2 mx-3 border-t border-gray-200" />

        <div className="px-2 space-y-0.5">
          <FiltersSection />
          {canSee("dashboards") && (
          <NavRow
            href="/dashboards"
            icon={LayoutDashboard}
            label="Dashboards"
            expandable
            expanded={dashboardsOpen}
            onToggle={() => setDashboardsOpen((v) => !v)}
            trailing={
              <Plus
                className="h-3.5 w-3.5 text-gray-400 hover:text-gray-700"
              />
            }
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
                icon={LayoutDashboard}
                label="Default dashboard"
                indent
              />
              <div className="my-1.5 border-t border-gray-100" />
              {/* <NavRow
                href="/dashboards"
                icon={LayoutDashboard}
                label="View all dashboards"
                indent
              /> */}
            </div>
          )}
          {canSee("timesheet") && (
            <span data-tour="timesheet">
              <NavRow href="/timesheet" icon={Clock} label="Timesheet" active={isActive("/timesheet")} />
            </span>
          )}
          {canSee("reports") && (
            <span data-tour="reports">
              <NavRow href="/reports" icon={BarChart3} label="Reports" active={isActive("/reports")} />
            </span>
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

        <div className="my-2 mx-3 border-t border-gray-200" />
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
