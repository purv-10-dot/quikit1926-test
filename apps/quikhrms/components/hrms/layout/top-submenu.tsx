"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { clsx } from "clsx";
import { useRoles, hasAnyRole } from "@/lib/hooks/use-roles";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { navigation, childHasActive, type NavItem, type NavChild } from "./sidebar";

/** True when `pathname` is `href` or a route nested under it. */
function matchesPath(pathname: string, href?: string): boolean {
  if (!href) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Horizontal sub-menu bar shown under the top bar. Reflects the sidebar module
 * the user is currently inside — its child pages become tabs across the top
 * (e.g. Leaves → My Leaves · Team Leaves · Leave Calendar · Leave Settings).
 * Renders nothing on modules that have no sub-pages.
 */
export function TopSubmenu() {
  const pathname = usePathname() ?? "";
  const { roles } = useRoles();
  const { hasAnyPermission, permissions, navKeys } = useDashboardConfig();
  const isSuper = permissions.includes("*");

  const navSet = useMemo(() => new Set(navKeys), [navKeys]);
  const navConfigured = !isSuper && navSet.size > 0;
  const navAllowed = (key?: string) => {
    if (!navConfigured || !key) return true;
    if (navSet.has(key)) return true;
    for (const k of navSet) if (k.startsWith(`${key}.`)) return true;
    return false;
  };
  const nodeVisible = (n: { roles?: string[]; perms?: string[]; hideForSuperAdmin?: boolean; navKey?: string }) => {
    if (n.hideForSuperAdmin && isSuper) return false;
    if (!navAllowed(n.navKey)) return false;
    if (isSuper) return true;
    if (n.perms && n.perms.length > 0) return hasAnyPermission(n.perms);
    return hasAnyRole(roles, n.roles);
  };

  // Where a child tab points — its own href, or the first page under it.
  const childHref = (c: NavChild): string | undefined =>
    c.href ?? c.children?.find((g) => nodeVisible(g))?.href ?? c.children?.[0]?.href;

  // Which top-level module the current route lives in (longest href match wins,
  // so nested routes resolve to the right module).
  const active = useMemo(() => {
    let best: { item: NavItem; len: number } | null = null;
    for (const item of navigation) {
      const hrefs: string[] = [];
      if (item.href) hrefs.push(item.href);
      item.children?.forEach((c) => {
        if (c.href) hrefs.push(c.href);
        c.children?.forEach((g) => { if (g.href) hrefs.push(g.href); });
      });
      for (const h of hrefs) {
        if (matchesPath(pathname, h) && h.length > (best?.len ?? -1)) best = { item, len: h.length };
      }
    }
    return best?.item ?? null;
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active || !active.children) return null;

  const visibleChildren = active.children.filter((c) => nodeVisible(c) && childHref(c));
  if (visibleChildren.length < 2) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
      <span className="inline-flex items-center gap-1.5 pr-3 mr-1 text-[13px] font-bold text-gray-800 dark:text-gray-100 whitespace-nowrap">
        {active.label} <span className="text-green-600">→</span>
      </span>
      {visibleChildren.map((c) => {
        const href = childHref(c)!;
        const isActive =
          childHasActive(c, pathname) ||
          matchesPath(pathname, c.href) ||
          (c.children?.some((g) => matchesPath(pathname, g.href)) ?? false);
        return (
          <Link
            key={c.label}
            href={href}
            className={clsx(
              "relative whitespace-nowrap px-3 py-3 text-[13px] font-semibold transition-colors",
              isActive ? "text-green-700 dark:text-green-400" : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200",
            )}
          >
            {c.label}
            {isActive && <span className="absolute left-2 right-2 bottom-0 h-[2.5px] rounded-t bg-green-600" />}
          </Link>
        );
      })}
    </div>
  );
}
