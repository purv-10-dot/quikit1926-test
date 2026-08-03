"use client";

import { navigation, type NavItem, type NavChild, type NavLeaf } from "@/components/hrms/layout/sidebar";
import { hasAnyRole, type Role } from "@/lib/hooks/use-roles";

/**
 * Route-level access derived from the sidebar navigation tree.
 *
 * The sidebar hides links a role can't use, but hiding a link never blocked
 * the URL — anything that navigated directly (dashboard Quick actions, a
 * pasted link, browser history) reached the page anyway. These helpers make
 * the nav tree the single source of truth for BOTH the sidebar and a real
 * route guard, so "not in your menu" also means "not reachable".
 *
 * Server APIs still enforce their own permissions (withAuth) — this layer
 * stops the UI from opening pages the user has no business seeing.
 */

/** The visibility-relevant fields shared by every nav node. */
interface NavNodeMeta {
  roles?: string[];
  perms?: string[];
  hideForSuperAdmin?: boolean;
  navKey?: string;
}

export interface NavAccessCtx {
  /** Holder of the "*" wildcard permission. */
  isSuper: boolean;
  permissions: string[];
  roles: Role[];
  /** Per-role navigation allow-list. Empty = not configured → default-allow. */
  navKeys: string[];
  /** New joiner locked down until HR confirms employment. */
  preBoarding: boolean;
  employeeId: string | null;
}

function hasAnyPermission(permissions: string[], codes: string[] | undefined): boolean {
  if (!codes || codes.length === 0) return true;
  if (permissions.includes("*")) return true;
  return codes.some((c) => permissions.includes(c));
}

/** Role/permission gate for a single node (mirrors the sidebar's `nodeVisible`). */
function nodeVisible(n: NavNodeMeta, ctx: NavAccessCtx): boolean {
  if (n.hideForSuperAdmin && ctx.isSuper) return false;
  if (ctx.isSuper) return true;
  if (n.perms && n.perms.length > 0) return hasAnyPermission(ctx.permissions, n.perms);
  return hasAnyRole(ctx.roles, n.roles);
}

/** Navigation allow-list gate (mirrors the sidebar's `navAllowed`). */
function navAllowed(key: string | undefined, ctx: NavAccessCtx): boolean {
  const navSet = new Set(ctx.navKeys);
  const configured = !ctx.isSuper && navSet.size > 0;
  if (!configured || !key) return true;
  if (navSet.has(key)) return true;
  // A parent link stays visible when any of its child tab keys is granted.
  for (const k of navSet) if (k.startsWith(`${key}.`)) return true;
  return false;
}

/** Both gates together — what the sidebar uses to render a node. */
function isNodeVisible(n: NavNodeMeta, ctx: NavAccessCtx): boolean {
  return nodeVisible(n, ctx) && navAllowed(n.navKey, ctx);
}

interface FlatRoute {
  /** Path portion of the nav href (query stripped). */
  path: string;
  /** Ancestor chain, root first — every level must be visible to reach the leaf. */
  chain: NavNodeMeta[];
}

/**
 * Every linkable path in the nav tree with the ancestor chain that guards it.
 * The sidebar only renders a child when its parent group is also visible, so
 * reachability is an AND over the whole chain — not just the leaf's own perms.
 */
const FLAT_ROUTES: FlatRoute[] = (() => {
  const out: FlatRoute[] = [];
  const push = (href: string | undefined, chain: NavNodeMeta[]) => {
    if (!href) return;
    out.push({ path: href.split("?")[0], chain });
  };
  for (const item of navigation as NavItem[]) {
    push(item.href, [item]);
    for (const child of item.children ?? ([] as NavChild[])) {
      push(child.href, [item, child]);
      for (const leaf of child.children ?? ([] as NavLeaf[])) {
        push(leaf.href, [item, child, leaf]);
      }
    }
  }
  return out;
})();

/**
 * Paths every signed-in user may open regardless of the nav tree — the app
 * shell and personal/system pages that carry no org data of their own.
 */
const ALWAYS_ALLOWED = ["/dashboard", "/notifications", "/login", "/auth-handoff"];

function normalize(pathname: string): string {
  const p = pathname.split("?")[0];
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

function matches(routePath: string, pathname: string): boolean {
  return pathname === routePath || pathname.startsWith(`${routePath}/`);
}

/**
 * Can this user open `pathname`?
 *
 * - PreBoarding users are locked to their own onboarding tracker (same rule
 *   the sidebar lockdown applies).
 * - A path known to the nav tree is allowed only when some full ancestor
 *   chain leading to it is visible. The MOST SPECIFIC match wins, so
 *   `/attendance/regularizations` is judged on its own (approver) perms
 *   rather than the looser `/attendance` entry.
 * - A path the nav tree doesn't know (detail pages like `/employees/<id>`,
 *   one-off flows) is allowed — those pages carry their own checks, and
 *   defaulting to deny would lock users out of legitimate screens.
 */
export function isPathAllowed(pathname: string, ctx: NavAccessCtx): boolean {
  const path = normalize(pathname);

  if (ALWAYS_ALLOWED.some((p) => matches(p, path))) return true;

  // Own onboarding tracker — reachable without onboarding-module permissions
  // (it's the user's own checklist, and the API scopes it to them).
  if (ctx.employeeId && matches(`/onboarding/${ctx.employeeId}`, path)) return true;

  if (ctx.preBoarding) return false;

  const candidates = FLAT_ROUTES.filter((r) => matches(r.path, path));
  if (candidates.length === 0) return true;

  const longest = Math.max(...candidates.map((r) => r.path.length));
  return candidates
    .filter((r) => r.path.length === longest)
    .some((r) => r.chain.every((n) => isNodeVisible(n, ctx)));
}
