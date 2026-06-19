/**
 * Row-level ownership guard for entity mutation routes.
 *
 * Rule (default): only the creator of a row can edit / delete it. Same-role
 * peers on the same project can SEE the row (the list / GET endpoint stays
 * tenant-scoped) but the row's Edit and Delete actions are owner-only.
 *
 * The one bypass is the top client role (userType === "ADMIN") and any
 * wildcard-permission account (platform super admin / tenant admin). They
 * can override drafts when a creator is unavailable. HO_USER and SITE_ADMIN
 * are intentionally NOT bypassed by default — they participate via the
 * approval workflow (approve / reject / return), not by editing the
 * requester's draft in place. That keeps the audit trail honest.
 *
 * Usage in a route:
 *
 *   const guard = requireOwnership(existing, ctx, "purchase requisition");
 *   if (guard) return guard;
 *
 * Or as a pure predicate from anywhere (e.g. building API responses that
 * include `canEdit: boolean` flags):
 *
 *   const canEdit = canEditEntity(row, ctx);
 */

import { NextResponse } from "next/server";
import type { TenantContext } from "./context";

/** Minimal shape every Cn* entity satisfies — the `createdBy` audit field. */
export interface OwnableRow {
  createdBy: string;
}

export interface OwnershipOptions {
  /**
   * Whether the tenant ADMIN userType (top client role) bypasses ownership.
   * Default true — ADMINs typically need to clean up other users' stuck
   * drafts. Pass `false` to lock down records to the creator alone (rarely
   * needed; mostly for highly-sensitive workflows).
   */
  adminBypass?: boolean;
  /**
   * Allow HO_USER to bypass. Off by default — HO users approve, they don't
   * edit. Enable only on entities where HO is the de facto data owner
   * (none today).
   */
  hoUserBypass?: boolean;
  /**
   * Allow SITE_ADMIN to bypass. Off by default for the same reason.
   */
  siteAdminBypass?: boolean;
}

const DEFAULTS: Required<OwnershipOptions> = {
  adminBypass: true,
  hoUserBypass: false,
  siteAdminBypass: false,
};

/**
 * Pure predicate: can `ctx`'s user edit/delete `row`?
 *
 * Order of checks: super-admin wildcard → ADMIN bypass → owner → bust.
 * Higher roles falling through to "not owner" is intentional — peer roles
 * shouldn't silently inherit edit rights just because they're senior.
 */
export function canEditEntity(
  row: OwnableRow | null | undefined,
  ctx: TenantContext,
  options: OwnershipOptions = {},
): boolean {
  if (!row) return false;
  const opts = { ...DEFAULTS, ...options };

  // Wildcard `*` (platform super admin / tenant admin baked permission set)
  // always passes — these are the break-glass accounts.
  if (ctx.permissions.has("*")) return true;

  // Top client role explicitly opts in via userType (separate from the
  // permission wildcard so a tenant who removed `*` from ADMIN still gets
  // the right behavior).
  if (opts.adminBypass && ctx.userType === "ADMIN") return true;
  if (opts.hoUserBypass && ctx.userType === "HO_USER") return true;
  if (opts.siteAdminBypass && ctx.userType === "SITE_ADMIN") return true;

  return row.createdBy === ctx.userId;
}

/**
 * Route-handler guard. Returns a 403 NextResponse to short-circuit the
 * handler when the caller isn't allowed to edit/delete the row, or `null`
 * when the action should proceed.
 *
 *   const guard = requireOwnership(existing, ctx, "indent");
 *   if (guard) return guard;
 *
 * `entityLabel` is interpolated into the error message so the client can
 * show a meaningful toast ("Only the creator can edit this indent.").
 */
export function requireOwnership(
  row: OwnableRow | null | undefined,
  ctx: TenantContext,
  entityLabel: string,
  options: OwnershipOptions = {},
): NextResponse | null {
  if (canEditEntity(row, ctx, options)) return null;
  return NextResponse.json(
    {
      error: `Only the creator can edit this ${entityLabel}.`,
      code: "NOT_OWNER",
    },
    { status: 403 },
  );
}
