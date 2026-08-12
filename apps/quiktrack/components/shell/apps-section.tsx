"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Gauge,
  Grid2x2,
  Hexagon,
  Info,
  LayoutGrid,
  MoreHorizontal,
  Plug,
} from "lucide-react";

/**
 * Sidebar "Apps" section — the org-level (holistic, cross-project) entry point
 * for installed apps. Mirrors TestRail-in-Jira's sidebar tree:
 *
 *   Apps                         ⋯
 *     Your apps
 *     ⊙ QuikTest                 ⋯
 *        ▾ QuikTest
 *             Dashboard
 *             Projects
 *             Go to QuikTest
 *        ▾ About
 *             About QuikTest
 *             Space Integration
 *     Recommended for your team
 *
 * Structural note: this is deliberately a sibling file rather than more markup
 * inside `sidebar.tsx` (already ~600 LOC, over the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md). Follows the same self-contained pattern as
 * `filters-section.tsx` — own state, own fetches, one export.
 *
 * The per-project surface is separate: each space gets a "Tests" tab via
 * PROJECT_TABS (lib/projectTabs.ts). This section is the cross-project rollup.
 */

/** A leaf row under an app's group. */
interface AppLeaf {
  label: string;
  href: string;
  icon: React.ElementType;
  /** Renders the outbound-link glyph; still an internal route. */
  external?: boolean;
}

/** One collapsible group of leaves under an app. */
interface AppGroup {
  key: string;
  label: string;
  leaves: AppLeaf[];
}

/** An installed app: a header row plus its groups. */
interface InstalledApp {
  key: string;
  label: string;
  icon: React.ElementType;
  groups: AppGroup[];
}

/**
 * Installed apps. QuikTest is the only entry today; the shape is a list so a
 * second module drops in without touching the render.
 */
const INSTALLED_APPS: InstalledApp[] = [
  {
    key: "quiktest",
    label: "QuikTest",
    icon: Hexagon,
    groups: [
      {
        key: "main",
        label: "QuikTest",
        leaves: [
          { label: "Dashboard", href: "/test", icon: Gauge },
          { label: "Projects", href: "/test/projects", icon: LayoutGrid },
          { label: "Go to QuikTest", href: "/test", icon: Grid2x2, external: true },
        ],
      },
      {
        key: "about",
        label: "About",
        leaves: [
          { label: "About QuikTest", href: "/test/about", icon: Info },
          { label: "Space Integration", href: "/test/integration", icon: Plug },
        ],
      },
    ],
  },
];

const LEAF_BASE = "flex items-center gap-2 pr-3 h-8 text-sm rounded";

export function AppsSection() {
  const pathname = usePathname();

  const [open, setOpen] = useState(() => Boolean(pathname?.startsWith("/test")));
  // Apps expanded within the section. QuikTest starts open so the tree matches
  // the reference screenshot on first paint.
  const [openApps, setOpenApps] = useState<Set<string>>(new Set(["quiktest"]));
  // Groups expanded within an app, keyed `<appKey>:<groupKey>` so two apps can
  // both have an "About" group without colliding.
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    new Set(["quiktest:main", "quiktest:about"]),
  );

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const toggleApp = (key: string) => setOpenApps((prev) => toggle(prev, key));
  const toggleGroup = (key: string) => setOpenGroups((prev) => toggle(prev, key));

  // Exact-match only. `/test` is a prefix of `/test/projects`, so
  // startsWith would light up Dashboard on every child route.
  const isActive = (href: string) => pathname === href;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="qt-nav-row w-full flex items-center gap-2 px-3 h-8 text-sm rounded text-left text-gray-700 hover:bg-gray-100 group"
      >
        <Grid2x2 className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">Apps</span>
        <MoreHorizontal className="h-3.5 w-3.5 text-gray-400 opacity-0 group-hover:opacity-100" />
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="pt-0.5 space-y-0.5">
          <div className="pl-6 pr-3 pb-0.5 text-[11px] font-medium text-gray-500">
            Your apps
          </div>

          {INSTALLED_APPS.map((app) => {
            const AppIcon = app.icon;
            const appOpen = openApps.has(app.key);

            return (
              <div key={app.key}>
                <button
                  type="button"
                  onClick={() => toggleApp(app.key)}
                  className="qt-nav-row w-full flex items-center gap-2 pl-6 pr-3 h-8 text-sm rounded text-left text-gray-700 hover:bg-gray-100 group"
                >
                  <AppIcon className="h-4 w-4 shrink-0 text-gray-500" />
                  <span className="flex-1 truncate">{app.label}</span>
                  <MoreHorizontal className="h-3.5 w-3.5 text-gray-400 opacity-0 group-hover:opacity-100" />
                </button>

                {appOpen &&
                  app.groups.map((group) => {
                    const groupKey = `${app.key}:${group.key}`;
                    const groupOpen = openGroups.has(groupKey);

                    return (
                      <div key={groupKey}>
                        <button
                          type="button"
                          onClick={() => toggleGroup(groupKey)}
                          className="w-full flex items-center gap-2 pl-9 pr-3 h-8 text-sm rounded text-left text-gray-700 hover:bg-gray-100"
                        >
                          {groupOpen ? (
                            <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          )}
                          <span className="flex-1 truncate">{group.label}</span>
                        </button>

                        {groupOpen && (
                          <div className="space-y-0.5">
                            {group.leaves.map((leaf) => {
                              const active = isActive(leaf.href);
                              return (
                                <Link
                                  key={`${groupKey}:${leaf.label}`}
                                  href={leaf.href}
                                  className={`${LEAF_BASE} pl-[3.25rem] ${
                                    active
                                      ? "bg-blue-50 text-blue-700 font-medium"
                                      : "text-gray-700 hover:bg-gray-100"
                                  }`}
                                >
                                  <span className="flex-1 truncate">{leaf.label}</span>
                                  {leaf.external && (
                                    <ExternalLink className="h-3 w-3 shrink-0 text-gray-400" />
                                  )}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })}

          <div className="pl-6 pr-3 pt-1 pb-0.5 text-[11px] font-medium text-gray-500">
            Recommended for your team
          </div>
        </div>
      )}
    </div>
  );
}
