import { NextResponse } from "next/server";

/**
 * Role-based permission gate. Call at the top of any endpoint that
 * mutates approved/finalized state or touches permission-sensitive data.
 *
 * Roles come from session.user.membershipRole via @quikit/auth.
 *
 * Default policy (internal construction ERP):
 *   - owner, admin           → everything
 *   - project_manager        → everything except tenant settings
 *   - accountant             → finance + reports, read others
 *   - site_supervisor        → DPR, safety, read
 *   - member                 → read-only by default
 *
 * Actions map loosely:
 *   approve.*   → owner | admin | project_manager
 *   finalize.*  → owner | admin | accountant
 *   delete.*    → owner | admin
 *   post.*      → owner | admin | project_manager | site_supervisor
 */
export type Role = "owner" | "admin" | "project_manager" | "accountant" | "site_supervisor" | "member" | string;

const PRIVILEGED: Role[] = ["owner", "admin"];
const MANAGER_PLUS: Role[] = ["owner", "admin", "project_manager"];
const FINANCE_PLUS: Role[] = ["owner", "admin", "accountant"];
const OPERATIONS_PLUS: Role[] = ["owner", "admin", "project_manager", "site_supervisor"];

export function canApprove(role: Role | null | undefined): boolean {
  return !!role && MANAGER_PLUS.includes(role as Role);
}
export function canFinalize(role: Role | null | undefined): boolean {
  return !!role && FINANCE_PLUS.includes(role as Role);
}
export function canDelete(role: Role | null | undefined): boolean {
  return !!role && PRIVILEGED.includes(role as Role);
}
export function canPost(role: Role | null | undefined): boolean {
  return !!role && OPERATIONS_PLUS.includes(role as Role);
}
export function canManageSettings(role: Role | null | undefined): boolean {
  return !!role && PRIVILEGED.includes(role as Role);
}

/** 403 response helper for use inside route handlers. */
export function forbidden(reason: string) {
  return NextResponse.json({ success: false, error: `Forbidden: ${reason}`, code: "PERMISSION_DENIED" }, { status: 403 });
}
