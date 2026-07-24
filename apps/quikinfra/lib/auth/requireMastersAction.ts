/**
 * Masters-route gate (Item 7 batch 1).
 *
 * Drop-in replacement for the bare `getTenantContext()` check used in
 * every /api/masters/* route. Verifies the caller has the v2 permission
 * `construction.masters.<action>` (or the `*` wildcard) before returning
 * the tenant context.
 *
 * Replaces this pattern:
 *
 *   const ctx = await getTenantContext();
 *   if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
 *
 * with:
 *
 *   const ctxOrResp = await requireMastersAction("construction.master_vendor", "view");
 *   if (ctxOrResp instanceof NextResponse) return ctxOrResp;
 *   const ctx = ctxOrResp;
 *
 * Each masters/organization page passes its OWN resource (per-page split):
 * e.g. Vendors → "construction.master_vendor", GST → "construction.org_gst".
 *
 * Action mapping per HTTP method:
 *   GET    → "view"
 *   POST   → "create"
 *   PUT    → "edit"
 *   PATCH  → "edit"
 *   DELETE → "delete"
 *
 * Routes that import/export sheets use "import" / "export".
 */

import { NextResponse } from "next/server";
import { getTenantContext, type TenantContext } from "@/lib/auth/context";

export type MastersAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "import"
  | "export";

export async function requireMastersAction(
  resource: string,
  action: MastersAction,
): Promise<TenantContext | NextResponse> {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json(
      { error: "Unauthenticated" },
      { status: 401 },
    );
  }
  // Masters/organization rows are lookup/reference data picked across every
  // module (PR, BOQ, GRN, stock, projects). VIEW is therefore granted to ANY
  // authenticated user in the org — gating reads per page would break the
  // dropdowns those other modules rely on. Per-page VIEW visibility is
  // enforced client-side (sidebar) via the permission matrix instead. Reads
  // stay scoped to ctx.orgId in each repository, so this never crosses
  // tenants. Mutating actions (create / edit / delete / import / export) are
  // gated on the PAGE's own resource, e.g. `construction.master_vendor.edit`.
  if (action === "view") {
    return ctx;
  }
  const key = `${resource}.${action}`;
  // Admin role + super-admin both hold the `*` wildcard. Honour both.
  if (!ctx.permissions.has(key) && !ctx.permissions.has("*")) {
    return NextResponse.json(
      { error: `Missing permission: ${key}` },
      { status: 403 },
    );
  }
  return ctx;
}
