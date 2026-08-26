/**
 * The single authorization gate for every Sales Cost API route.
 *
 * Sales Cost exposes salaries and per-rep spend, so it is restricted to
 * Super Admin / Organization Admin / CRM Administrator via the EXISTING
 * `isCrmAdminUser` helper — the same gate Settings → Users and Settings →
 * Activity Targets use. `CRM_ADMIN_ROLES` in lib/auth/is-crm-admin.ts already
 * contains `admin`, `administrator` and `org_admin`; SalesManager, SalesUser,
 * MarketingUser and FinanceUser are absent from it and therefore get a 403.
 *
 * This is intentionally NOT a new `CRM_MODULES` permission key: a module key
 * would let an org grant `salesCost.view` to a Sales Manager through the
 * permission-template UI, which is exactly what the requirement forbids. No
 * parallel RBAC system is introduced — this file only composes the existing
 * `requireApiUser` + `isCrmAdminUser` primitives so the check cannot drift
 * between the ~6 route files that need it.
 */
import { NextResponse } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { isCrmAdminUser } from "@/lib/auth/is-crm-admin";
import type { SessionUser } from "@/types/permission";

/** 403 body, matching the shape used by every other admin-only settings route. */
export function salesCostForbidden(): NextResponse {
  return NextResponse.json(
    { success: false, error: "Access restricted to administrators." },
    { status: 403 },
  );
}

/**
 * Resolve the caller, or return the response to send back.
 *
 * Returns a `NextResponse` for both failure modes — 401 unauthenticated (from
 * `requireApiUser`) and 403 non-admin — so callers only need:
 *
 *     const user = await requireSalesCostAdmin();
 *     if (isResponse(user)) return user;
 */
export async function requireSalesCostAdmin(): Promise<SessionUser | NextResponse> {
  const user = await requireApiUser();
  if (isResponse(user)) return user;
  if (!isCrmAdminUser(user)) return salesCostForbidden();
  return user;
}

/**
 * Turn a thrown error into a response.
 *
 * Used instead of the shared `errorResponse` because that helper returns
 * `{ error }` without a `success` key, while this app's API contract (see
 * apps/quikcrm/CLAUDE.md) requires `{ success: false, error }` on every
 * response. It honours `statusCode` the same way, so a `SalesCostError` thrown
 * with 404/409 keeps its status instead of collapsing to 500.
 */
export function salesCostError(err: unknown): NextResponse {
  const e = err as { statusCode?: number; message?: string };
  const status =
    typeof e?.statusCode === "number" && Number.isInteger(e.statusCode) ? e.statusCode : 500;
  const message =
    status >= 500 ? "Operation failed" : e?.message || "Operation failed";
  // Only genuine server faults are logged; a 400/404/409 is expected input.
  if (status >= 500) console.error("[sales-cost]", err);
  return NextResponse.json({ success: false, error: message }, { status });
}
