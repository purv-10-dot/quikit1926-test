/**
 * QuikVC role-based access control.
 *
 * Roles (from VCFundProfile + Membership.role):
 *   - analyst       → builds memos, scores deals, runs research
 *   - partner       → approves to IC, settles IC votes, signs term sheets
 *   - ic-member     → casts IC votes only (subset of partner)
 *   - fund-admin    → admin pages (verticals, scoring, IC rules, term-sheet template),
 *                     investor + commitment + allocation + repayment management
 *   - founder       → founder-portal-only
 *   - investor      → investor-portal-only
 *   - admin         → tenant-level admin (inherits fund-admin)
 *
 * Hierarchy used by helpers below — `admin` is treated as a wildcard.
 */
import type { NextRequest, NextResponse } from "next/server";
import { NextResponse as NR } from "next/server";
import { db } from "@/lib/db";
import { audit, type AuditAction } from "@/lib/audit";

export type VCRole =
  | "analyst"
  | "partner"
  | "ic-member"
  | "fund-admin"
  | "founder"
  | "investor"
  | "admin";

/** Roles that can perform admin-write operations on configuration. */
export const FUND_ADMIN_ROLES: VCRole[] = ["fund-admin", "admin"];

/** Roles that can advance deals to IC and settle votes. */
export const PARTNER_ROLES: VCRole[] = ["partner", "fund-admin", "admin"];

/** Roles that can cast an IC vote on a frozen memo. */
export const IC_VOTING_ROLES: VCRole[] = ["partner", "ic-member", "fund-admin", "admin"];

/** Roles that can move capital around (allocate, schedule, record payments). */
export const CAPITAL_OPS_ROLES: VCRole[] = ["fund-admin", "partner", "admin"];

/** Roles that can convert sourced opportunities and edit deals. */
export const ANALYST_ROLES: VCRole[] = ["analyst", "partner", "fund-admin", "admin"];

/**
 * Read the user's VC role for this tenant from Membership.
 * Returns null if no active membership.
 */
export async function getVCRole(userId: string, orgId: string): Promise<VCRole | null> {
  const m = await db.membership.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { role: true, status: true },
  });
  if (!m || m.status !== "active") return null;
  return m.role as VCRole;
}

/**
 * Throw a 403 NextResponse if the role is not in the allowlist.
 * Returns null when allowed (caller continues).
 *
 * Usage inside a withTenantAuth handler:
 *   const role = await getVCRole(userId, orgId);
 *   const denied = denyIfNotInRoles(role, FUND_ADMIN_ROLES);
 *   if (denied) return denied;
 */
export function denyIfNotInRoles(
  role: VCRole | null,
  allowed: VCRole[],
): NextResponse | null {
  if (!role) {
    return NR.json({ success: false, error: "No active membership" }, { status: 403 });
  }
  if (!allowed.includes(role)) {
    return NR.json(
      { success: false, error: `Forbidden — requires one of: ${allowed.join(", ")}` },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Convenience: load the role + run the deny check in one call.
 * Returns either { role } or a NextResponse to short-circuit.
 */
export async function requireVCRole(
  userId: string,
  orgId: string,
  allowed: VCRole[],
): Promise<{ role: VCRole } | NextResponse> {
  const role = await getVCRole(userId, orgId);
  const denied = denyIfNotInRoles(role, allowed);
  if (denied) return denied;
  return { role: role as VCRole };
}

/**
 * Audit-aware role check. Writes a "rbac.deny" audit log row when the role
 * isn't in the allowlist, then returns 403 NextResponse. On allow, returns
 * null + writes nothing (the calling route can audit the success path on
 * its own with a more specific action like "allocation.create").
 *
 * Use this at the top of any privileged route handler:
 *
 *   const denied = await requireRoleOrAudit(userId, orgId, FUND_ADMIN_ROLES, {
 *     action: "vertical.update",
 *     resource: params.id,
 *     req,
 *   });
 *   if (denied) return denied;
 */
export async function requireRoleOrAudit(
  userId: string,
  orgId: string,
  allowed: VCRole[],
  ctx: { action: AuditAction; resource?: string; req?: NextRequest },
): Promise<NextResponse | null> {
  const role = await getVCRole(userId, orgId);
  const denied = denyIfNotInRoles(role, allowed);
  if (denied) {
    await audit({
      orgId,
      userId,
      action: "rbac.deny",
      resource: ctx.resource,
      outcome: "denied",
      metadata: { attemptedAction: ctx.action, role: role ?? null, allowed },
      req: ctx.req,
    });
    return denied;
  }
  return null;
}
